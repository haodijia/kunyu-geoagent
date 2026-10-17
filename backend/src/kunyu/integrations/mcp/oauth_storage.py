"""SDK token stores; refresh expiry is measured from receipt, never restart time."""

import logging
from builtins import BaseExceptionGroup
from datetime import UTC, datetime, timedelta

from mcp.shared.auth import OAuthClientInformationFull, OAuthClientMetadata, OAuthToken

from kunyu.persistence.mcp.oauth import McpOAuthRepository


class OAuthLoginRequired(RuntimeError):
    pass


class OAuthLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if record.exc_info:
            # SDK validation errors can include a token response in their exception text.
            kind = record.exc_info[0].__name__
            record.msg, record.args = "MCP OAuth SDK error_type=%s", (kind,)
            record.exc_info, record.exc_text = None, None
        return True


def contains_exception(error: BaseException, kind: type[BaseException]) -> bool:
    return isinstance(error, kind) or (
        isinstance(error, BaseExceptionGroup)
        and any(contains_exception(child, kind) for child in error.exceptions)
    )


def expires_at(tokens: OAuthToken) -> datetime | None:
    return (
        None
        if tokens.expires_in is None
        else datetime.now(UTC) + timedelta(seconds=tokens.expires_in)
    )


class PendingOAuthStorage:
    def __init__(self, metadata: OAuthClientMetadata, client_id: str | None) -> None:
        self.metadata = metadata
        self.tokens: OAuthToken | None = None
        self.expiry: datetime | None = None
        self.client = (
            OAuthClientInformationFull(
                client_id=client_id,
                **metadata.model_dump(mode="json", exclude_none=True),
            )
            if client_id is not None
            else None
        )

    async def get_tokens(self):
        return self.tokens

    async def set_tokens(self, tokens: OAuthToken) -> None:
        self.tokens, self.expiry = tokens, expires_at(tokens)

    async def get_client_info(self):
        return self.client

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        self.client = client_info

    def value(self) -> dict:
        if self.tokens is None or self.client is None:
            raise RuntimeError("OAuth did not produce a complete credential.")
        return {
            "tokens": self.tokens.model_dump(mode="json", exclude_none=True),
            "client_info": self.client.model_dump(mode="json", exclude_none=True),
            "client_metadata": self.metadata.model_dump(mode="json", exclude_none=True),
            "expires_at": self.expiry,
        }


class StoredOAuthStorage:
    def __init__(
        self, repository: McpOAuthRepository, name: str, url: str, revision: int
    ) -> None:
        self.repository, self.name, self.url, self.revision = (
            repository,
            name,
            url,
            revision,
        )

    def record(self) -> dict:
        row = self.repository.get(self.name, self.url)
        if row is None:
            raise OAuthLoginRequired("MCP sign-in is required.")
        return row

    async def get_tokens(self) -> OAuthToken:
        row = self.record()
        tokens = OAuthToken.model_validate(row["tokens"])
        if row["expires_at"] is not None:
            tokens = tokens.model_copy(
                update={
                    "expires_in": max(
                        0, int((row["expires_at"] - datetime.now(UTC)).total_seconds())
                    )
                }
            )
        return tokens

    async def set_tokens(self, tokens: OAuthToken) -> None:
        self.repository.refresh(
            self.name,
            self.url,
            self.revision,
            tokens.model_dump(mode="json", exclude_none=True),
            expires_at(tokens),
        )

    async def get_client_info(self):
        return OAuthClientInformationFull.model_validate(self.record()["client_info"])

    async def set_client_info(self, _client_info) -> None:
        # Background connections cannot register or authorize a different client.
        raise OAuthLoginRequired("MCP sign-in is required.")
