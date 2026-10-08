"""Persist configuration and successful catalog revisions; credentials stay private."""

from datetime import UTC, datetime

from sqlalchemy import select

from kunyu.domain.mcp import McpSecrets, McpServerConfig
from kunyu.domain.runs import NONTERMINAL_RUN_STATE_VALUES
from kunyu.persistence.database import Database
from kunyu.persistence.models import McpServerRecord, RunRecord
from kunyu.persistence.time import as_utc


class McpRepository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def get(self, name: str) -> dict:
        with self.database.sessions() as session:
            row = session.get(McpServerRecord, name)
            if row is None:
                raise LookupError("MCP server does not exist.")
            return {
                "config": McpServerConfig.model_validate(row.config),
                "revision": row.revision,
                "catalog_revision": row.catalog_revision,
                "catalog": row.catalog,
                "secret_keys": sorted(row.secrets.get("headers", {}).keys())
                if row.config["transport"] == "streamable-http"
                else sorted(row.secrets.get("env", {}).keys()),
                "updated_at": as_utc(row.updated_at),
            }

    def names(self) -> tuple[str, ...]:
        with self.database.sessions() as session:
            return tuple(
                session.scalars(
                    select(McpServerRecord.name).order_by(McpServerRecord.name)
                )
            )

    def require_idle(self) -> None:
        with self.database.sessions() as session:
            if (
                session.scalar(
                    select(RunRecord.id)
                    .where(RunRecord.state.in_(NONTERMINAL_RUN_STATE_VALUES))
                    .limit(1)
                )
                is not None
            ):
                raise McpBusyError(
                    "Finish or cancel unfinished runs before changing MCP configuration."
                )

    def save(
        self,
        config: McpServerConfig,
        *,
        create: bool,
        expected_revision: int | None = None,
    ) -> None:
        with self.database.sessions.begin() as session:
            row = session.get(McpServerRecord, config.name)
            if create:
                if row is not None:
                    raise McpConflictError("This MCP server name already exists.")
                session.add(
                    McpServerRecord(
                        name=config.name,
                        config=config.model_dump(mode="json"),
                        revision=1,
                        secrets={},
                        catalog_revision=0,
                        catalog=None,
                        updated_at=datetime.now(UTC),
                    )
                )
            else:
                if row is None:
                    raise LookupError("MCP server does not exist.")
                if expected_revision is None or row.revision != expected_revision:
                    raise McpRevisionError(
                        "MCP configuration changed; reload it before editing."
                    )
                if row.config != config.model_dump(mode="json"):
                    row.config = config.model_dump(mode="json")
                    row.revision += 1
                    if row.config["transport"] == "stdio":
                        row.secrets = {"env": row.secrets.get("env", {})}
                    else:
                        row.secrets = {"headers": row.secrets.get("headers", {})}
                    row.updated_at = datetime.now(UTC)

    def secrets(self, name: str) -> McpSecrets:
        with self.database.sessions() as session:
            row = session.get(McpServerRecord, name)
            if row is None:
                raise LookupError("MCP server does not exist.")
            return McpSecrets.model_validate(row.secrets)

    def set_secrets(
        self, name: str, secrets: McpSecrets, expected_revision: int
    ) -> None:
        with self.database.sessions.begin() as session:
            row = session.get(McpServerRecord, name)
            if row is None:
                raise LookupError("MCP server does not exist.")
            if row.revision != expected_revision:
                raise McpRevisionError(
                    "MCP configuration changed; reload it before editing."
                )
            if (row.config["transport"] == "stdio" and secrets.headers) or (
                row.config["transport"] == "streamable-http" and secrets.env
            ):
                raise ValueError(
                    "Credentials do not match the configured MCP transport."
                )
            row.secrets = secrets.model_dump(mode="json")
            row.revision += 1
            row.updated_at = datetime.now(UTC)

    def publish(self, name: str, revision: int, catalog: dict) -> int:
        with self.database.sessions.begin() as session:
            row = session.get(McpServerRecord, name)
            if row is None or row.revision != revision:
                raise McpBusyError("MCP configuration changed during discovery.")
            if row.catalog != catalog:
                row.catalog = catalog
                row.catalog_revision += 1
            return row.catalog_revision

    def delete(self, name: str) -> None:
        with self.database.sessions.begin() as session:
            row = session.get(McpServerRecord, name)
            if row is None:
                raise LookupError("MCP server does not exist.")
            session.delete(row)


class McpBusyError(RuntimeError):
    pass


class McpRevisionError(RuntimeError):
    pass


class McpConflictError(RuntimeError):
    pass
