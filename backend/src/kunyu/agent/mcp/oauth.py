"""Human-owned SDK OAuth attempts; staged credentials commit only after success."""

import asyncio
import logging
from datetime import UTC, datetime
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

from mcp import Client
from mcp.client.auth.oauth2 import OAuthClientProvider
from mcp.shared.auth import (
    OAuthClientMetadata,
    OAuthMetadata,
    ProtectedResourceMetadata,
)

from kunyu.integrations.mcp.oauth_callback import OAuthCallback, OAuthDenied
from kunyu.integrations.mcp.oauth_storage import (
    OAuthLogFilter,
    OAuthLoginRequired,
    PendingOAuthStorage,
    StoredOAuthStorage,
    contains_exception,
)
from kunyu.integrations.mcp.transport import connect_transport
from kunyu.persistence.mcp_oauth import McpOAuthRepository

logger = logging.getLogger(__name__)


def valid_browser_url(url: str) -> bool:
    parsed = urlsplit(url)
    return (
        not parsed.username
        and not parsed.password
        and bool(parsed.hostname)
        and (
            parsed.scheme == "https"
            or (
                parsed.scheme == "http"
                and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
            )
        )
    )


class OAuthAttempt:
    def __init__(self, manager, name: str, revision: int) -> None:
        self.manager, self.name, self.revision = manager, name, revision
        self.id = str(uuid4())
        self.status = "preparing"
        self.url: str | None = None
        self.error_code: str | None = None
        self.task: asyncio.Task | None = None
        self.callback: OAuthCallback | None = None

    def view(self) -> dict:
        return {
            "id": self.id,
            "status": self.status,
            "authorization_url": self.url,
            "error_code": self.error_code,
        }

    async def redirect(self, url: str) -> None:
        if not valid_browser_url(url):
            raise ValueError("OAuth authorization URL must use HTTPS or loopback HTTP.")
        states = parse_qs(urlsplit(url).query).get("state", [])
        if len(states) != 1 or not states[0]:
            raise ValueError("OAuth authorization URL lacks a unique state.")
        self.callback.state = states[0]
        self.url, self.status = url, "waiting"

    async def run(self) -> None:
        repository = self.manager.repository
        mcp = self.manager.mcp
        try:
            row = mcp.repository.get(self.name)
            config = row["config"]
            if row["revision"] != self.revision or config.auth_mode != "oauth":
                raise ValueError("OAuth configuration changed before authorization.")
            options = config.oauth
            self.callback = OAuthCallback()
            redirect_uri = await self.callback.open(options.callback_port)
            metadata = OAuthClientMetadata(
                client_name="Kunyu",
                software_version="0.1.0",
                redirect_uris=[redirect_uri],
                grant_types=["authorization_code", "refresh_token"],
                response_types=["code"],
                token_endpoint_auth_method="none",
                scope=" ".join(options.scopes) if options.scopes else None,
            )
            storage = PendingOAuthStorage(metadata, options.client_id)
            provider = OAuthClientProvider(
                server_url=config.url,
                client_metadata=metadata,
                storage=storage,
                redirect_handler=self.redirect,
                callback_handler=lambda: self.callback.result,
                client_metadata_url=options.client_metadata_url,
            )
            async with asyncio.timeout(300):
                async with Client(
                    connect_transport(
                        config,
                        mcp.repository.secrets(self.name),
                        asyncio.Event(),
                        provider,
                    ),
                    read_timeout_seconds=30,
                    cache=None,
                ) as client:
                    if client.server_capabilities.tools is not None:
                        await client.list_tools(cache_mode="refresh")
                # A run that began while the person was signing in cannot acquire a new principal.
                mcp.repository.require_idle()
                value = storage.value()
                context = provider.context
                value["discovery"] = {
                    "auth_server_url": context.auth_server_url,
                    "oauth_metadata": context.oauth_metadata.model_dump(
                        mode="json", exclude_none=True
                    )
                    if context.oauth_metadata is not None
                    else None,
                    "protected_resource_metadata": context.protected_resource_metadata.model_dump(
                        mode="json", exclude_none=True
                    )
                    if context.protected_resource_metadata is not None
                    else None,
                }
                repository.commit(self.name, config.url, self.revision, value)
            self.status, self.url = "authorized", None
        except asyncio.CancelledError:
            self.status, self.url = "cancelled", None
            raise
        except OAuthDenied:
            self.status, self.error_code, self.url = "failed", "MCP_OAUTH_DENIED", None
        except TimeoutError:
            self.status, self.error_code, self.url = "failed", "MCP_OAUTH_TIMEOUT", None
        except Exception as error:
            code = (
                "MCP_OAUTH_DENIED"
                if contains_exception(error, OAuthDenied)
                else "MCP_OAUTH_FAILED"
            )
            self.status, self.error_code, self.url = "failed", code, None
            logger.warning(
                "MCP OAuth failed server=%s error_type=%s",
                self.name,
                type(error).__name__,
            )
        finally:
            if self.callback is not None:
                await self.callback.close()
            if not self.manager.closing:
                await mcp.activate(self.name)

    async def cancel(self) -> None:
        if self.task is not None and not self.task.done():
            self.task.cancel()
            try:
                await asyncio.shield(self.task)
            except asyncio.CancelledError:
                if asyncio.current_task().cancelling():
                    raise


class McpOAuthManager:
    def __init__(self, mcp) -> None:
        self.mcp = mcp
        self.repository = McpOAuthRepository(mcp.repository.database)
        self.attempts: dict[str, OAuthAttempt] = {}
        self.closing = False
        self.log_filter = OAuthLogFilter()
        logging.getLogger("mcp.client.auth.oauth2").addFilter(self.log_filter)

    def auth_for(self, config, revision: int):
        storage = StoredOAuthStorage(self.repository, config.name, config.url, revision)
        metadata = OAuthClientMetadata.model_validate(
            storage.record()["client_metadata"]
        )

        async def needs_login(_url=None):
            raise OAuthLoginRequired("MCP sign-in is required.")

        provider = OAuthClientProvider(
            server_url=config.url,
            client_metadata=metadata,
            storage=storage,
            redirect_handler=needs_login,
            callback_handler=needs_login,
            client_metadata_url=config.oauth.client_metadata_url,
        )
        record = storage.record()
        discovery = record["discovery"]
        provider.context.token_expiry_time = (
            record["expires_at"].timestamp()
            if record["expires_at"] is not None
            else None
        )
        provider.context.auth_server_url = discovery["auth_server_url"]
        if discovery["oauth_metadata"] is not None:
            provider.context.oauth_metadata = OAuthMetadata.model_validate(
                discovery["oauth_metadata"]
            )
        if discovery["protected_resource_metadata"] is not None:
            provider.context.protected_resource_metadata = (
                ProtectedResourceMetadata.model_validate(
                    discovery["protected_resource_metadata"]
                )
            )
        return provider

    def view(self, config) -> dict:
        record = (
            self.repository.get(config.name, config.url)
            if config.auth_mode == "oauth"
            else None
        )
        available = record is not None and (
            record["expires_at"] is None
            or record["expires_at"] > datetime.now(UTC)
            or bool(record["tokens"].get("refresh_token"))
        )
        attempt = self.attempts.get(config.name)
        return {
            "authenticated": available,
            "in_flight": attempt is not None
            and attempt.task is not None
            and not attempt.task.done(),
            "flow": attempt.view() if attempt is not None else None,
        }

    async def begin(self, name: str) -> dict:
        row = self.mcp.repository.get(name)
        if row["config"].auth_mode != "oauth":
            raise ValueError("This MCP server does not use OAuth.")
        current = self.attempts.get(name)
        if current is not None and current.task is not None and not current.task.done():
            return current.view()
        connection = self.mcp.connections.pop(name, None)
        if connection is not None:
            await connection.stop()
        attempt = OAuthAttempt(self, name, row["revision"])
        self.attempts[name] = attempt
        attempt.task = asyncio.create_task(attempt.run(), name=f"mcp:{name}:oauth")
        return attempt.view()

    async def cancel(self, name: str, flow_id: str) -> None:
        attempt = self.attempts.get(name)
        if attempt is None or attempt.id != flow_id:
            raise LookupError("OAuth attempt does not exist.")
        await attempt.cancel()

    async def close(self) -> None:
        self.closing = True
        try:
            await asyncio.gather(*(attempt.cancel() for attempt in self.attempts.values()))
        finally:
            logging.getLogger("mcp.client.auth.oauth2").removeFilter(self.log_filter)
