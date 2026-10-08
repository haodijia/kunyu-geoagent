"""One task owns an MCP SDK client and its bounded reconnection lifecycle."""

import asyncio
import logging
from collections.abc import Callable
from contextlib import AsyncExitStack
from time import monotonic

import mcp_types as types
from mcp import Client
from mcp.client.subscriptions import ToolsListChanged
from mcp.shared.exceptions import MCPError
from mcp_types.version import MODERN_PROTOCOL_VERSIONS

from kunyu.agent.runtime.tools import ToolExecutionError
from kunyu.domain.mcp import McpSecrets, McpServerConfig
from kunyu.integrations.mcp.catalog import discover_catalog
from kunyu.integrations.mcp.transport import connect_transport

logger = logging.getLogger(__name__)


def request_error(error: Exception) -> ToolExecutionError:
    if isinstance(error, TimeoutError) or (
        isinstance(error, MCPError) and error.error.code == types.REQUEST_TIMEOUT
    ):
        return ToolExecutionError("The MCP request timed out.", code="MCP_TIMEOUT")
    if isinstance(error, ConnectionError) or (
        isinstance(error, MCPError) and error.error.code == types.CONNECTION_CLOSED
    ):
        return ToolExecutionError(
            "The MCP connection is unavailable.", code="MCP_CONNECTION_UNAVAILABLE"
        )
    return ToolExecutionError("The MCP request failed.", code="MCP_REQUEST_FAILED")


class McpConnection:
    def __init__(
        self,
        config: McpServerConfig,
        secrets: McpSecrets,
        revision: int,
        publish: Callable,
        retire: Callable,
    ) -> None:
        self.config, self.secrets, self.revision = config, secrets, revision
        self.publish, self.retire = publish, retire
        self.status = "disconnected"
        self.error_code: str | None = None
        self.attempt = 0
        self.catalog_revision = 0
        self.client: Client | None = None
        self.task: asyncio.Task | None = None
        self.ready = asyncio.Event()
        self.stopping = False
        self.lost = asyncio.Event()
        self.dirty = asyncio.Event()
        self.wake = asyncio.Event()

    def start(self) -> None:
        if self.task is not None:
            raise RuntimeError("MCP connection already started.")
        self.status = "connecting"
        self.task = asyncio.create_task(self._run(), name=f"mcp:{self.config.name}")

    async def stop(self) -> None:
        self.stopping = True
        self.wake.set()
        self.retire(self)
        if self.task is not None:
            self.task.cancel()
            try:
                await asyncio.shield(self.task)
            except asyncio.CancelledError:
                if asyncio.current_task().cancelling():
                    raise

    async def _notification(self, message) -> None:
        if isinstance(message, Exception):
            self.lost.set()
        elif message.method == "notifications/tools/list_changed":
            self.dirty.set()
        self.wake.set()

    async def _watch_subscription(self, subscription) -> None:
        try:
            async for event in subscription:
                if isinstance(event, ToolsListChanged):
                    self.dirty.set()
                    self.wake.set()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.warning(
                "MCP subscription lost server=%s error_type=%s",
                self.config.name,
                type(error).__name__,
            )
        self.lost.set()
        self.wake.set()

    async def _stop_subscription(self, task: asyncio.Task) -> None:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            if asyncio.current_task().cancelling() > 1:
                raise

    async def _run(self) -> None:
        policy = self.config.reconnect
        failures = 0
        try:
            while not self.stopping:
                self.status = "connecting" if failures == 0 else "reconnecting"
                self.attempt = failures + 1
                self.lost.clear()
                self.dirty.clear()
                began = None
                try:
                    transport = connect_transport(self.config, self.secrets, self.lost)
                    async with AsyncExitStack() as resources:
                        async with asyncio.timeout(10):
                            client = await resources.enter_async_context(
                                Client(
                                    transport,
                                    read_timeout_seconds=self.config.tool_timeout_ms
                                    / 1000,
                                    message_handler=self._notification,
                                    cache=None,
                                    client_info=types.Implementation(
                                        name="kunyu", version="0.1.0"
                                    ),
                                )
                            )
                        if self.stopping:
                            break
                        self.client = client
                        tools_capability = client.server_capabilities.tools
                        if (
                            client.protocol_version in MODERN_PROTOCOL_VERSIONS
                            and tools_capability is not None
                            and tools_capability.list_changed
                        ):
                            async with asyncio.timeout(10):
                                subscription = await resources.enter_async_context(
                                    client.listen(tools_list_changed=True)
                                )
                            if not subscription.honored.tools_list_changed:
                                raise ValueError(
                                    "MCP did not honor its tool-list subscription."
                                )
                            watcher = asyncio.create_task(
                                self._watch_subscription(subscription),
                                name=f"mcp:{self.config.name}:tools",
                            )
                            resources.push_async_callback(
                                self._stop_subscription, watcher
                            )
                        async with asyncio.timeout(10):
                            catalog = await discover_catalog(client, self.config.name)
                        self.catalog_revision = self.publish(self, catalog)
                        self.status, self.error_code = "connected", None
                        self.ready.set()
                        began = monotonic()
                        while not self.stopping:
                            if self.lost.is_set():
                                raise ConnectionError("MCP transport closed.")
                            if self.dirty.is_set():
                                self.dirty.clear()
                                catalog = await discover_catalog(
                                    client, self.config.name
                                )
                                self.catalog_revision = self.publish(self, catalog)
                                continue
                            try:
                                await asyncio.wait_for(self.wake.wait(), timeout=1)
                                self.wake.clear()
                            except TimeoutError:
                                # EOF is observed on the SDK stream, including idle stdio exits.
                                continue
                        self.retire(self)
                        self.client = None
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    self.retire(self)
                    self.client = None
                    self.error_code = "MCP_CONNECTION_FAILED"
                    logger.warning(
                        "MCP connection failed server=%s error_type=%s",
                        self.config.name,
                        type(error).__name__,
                    )
                    if (
                        began is not None
                        and monotonic() - began >= policy.max_delay_ms / 1000
                    ):
                        failures = 0
                    failures += 1
                    self.ready.set()
                    if (
                        self.stopping
                        or not policy.enabled
                        or failures >= policy.max_attempts
                    ):
                        self.status = "failed"
                        break
                    self.status = "reconnecting"
                    delay = (
                        min(
                            policy.max_delay_ms,
                            policy.initial_delay_ms * 2 ** (failures - 1),
                        )
                        / 1000
                    )
                    try:
                        await asyncio.wait_for(self.wake.wait(), timeout=delay)
                        self.wake.clear()
                    except TimeoutError:
                        pass
        finally:
            self.retire(self)
            self.client = None
            self.ready.set()
            if self.stopping:
                self.status = "disconnected"

    def require_client(self) -> Client:
        if (
            self.stopping
            or self.status != "connected"
            or self.client is None
            or self.lost.is_set()
        ):
            raise ConnectionError("The MCP connection is unavailable.")
        return self.client
