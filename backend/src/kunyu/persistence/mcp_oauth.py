"""Private OAuth records with absolute expiry and configuration-bound writes."""

from datetime import UTC, datetime

from kunyu.persistence.database import Database
from kunyu.persistence.mcp import McpRevisionError
from kunyu.persistence.models import McpOAuthRecord, McpServerRecord
from kunyu.persistence.time import as_utc


class McpOAuthRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def get(self, name: str, url: str) -> dict | None:
        with self.database.sessions() as session:
            row = session.get(McpOAuthRecord, name)
            if row is None or row.server_url != url:
                return None
            return {
                "tokens": row.tokens,
                "client_info": row.client_info,
                "client_metadata": row.client_metadata,
                "discovery": row.discovery,
                "expires_at": as_utc(row.expires_at)
                if row.expires_at is not None
                else None,
            }

    def commit(self, name: str, url: str, revision: int, value: dict) -> None:
        with self.database.sessions.begin() as session:
            server = session.get(McpServerRecord, name)
            if (
                server is None
                or server.revision != revision
                or server.config.get("url") != url
                or server.config.get("auth_mode") != "oauth"
            ):
                raise McpRevisionError(
                    "OAuth configuration changed during authorization."
                )
            row = session.get(McpOAuthRecord, name)
            if row is None:
                row = McpOAuthRecord(name=name, server_url=url)
                session.add(row)
            row.tokens, row.client_info, row.client_metadata = (
                value["tokens"],
                value["client_info"],
                value["client_metadata"],
            )
            row.expires_at = value["expires_at"]
            row.discovery = value["discovery"]
            row.updated_at = datetime.now(UTC)
            server.revision += 1
            server.updated_at = datetime.now(UTC)

    def refresh(
        self,
        name: str,
        url: str,
        revision: int,
        tokens: dict,
        expires_at: datetime | None,
    ) -> None:
        with self.database.sessions.begin() as session:
            server = session.get(McpServerRecord, name)
            row = session.get(McpOAuthRecord, name)
            if (
                server is None
                or server.revision != revision
                or row is None
                or row.server_url != url
            ):
                raise McpRevisionError(
                    "OAuth configuration changed during token refresh."
                )
            row.tokens, row.expires_at, row.updated_at = (
                tokens,
                expires_at,
                datetime.now(UTC),
            )

    def clear(self, name: str, revision: int) -> None:
        with self.database.sessions.begin() as session:
            server = session.get(McpServerRecord, name)
            if server is None or server.revision != revision:
                raise McpRevisionError("OAuth configuration changed before sign-out.")
            row = session.get(McpOAuthRecord, name)
            if row is not None:
                session.delete(row)
            server.revision += 1
            server.updated_at = datetime.now(UTC)
