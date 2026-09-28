from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import Engine, inspect
from sqlalchemy.engine.reflection import Inspector

ALEMBIC_REVISION_TABLE = "alembic_version"
P2_05_REVISION = "0001"
P2_06_REVISION = "0002"
P2_05_TABLES = frozenset(
    {
        "workspaces",
        "workspace_removals",
        "sessions",
        "session_archives",
        "messages",
        "agent_events",
        "model_connections",
        "model_catalog_entries",
        "model_credentials",
    }
)


class DatabaseMigrationError(RuntimeError):
    pass


def upgrade_database(engine: Engine) -> None:
    config = _alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        inspector = inspect(connection)
        tables = frozenset(inspector.get_table_names())
        current_revision = MigrationContext.configure(connection).get_current_revision()
        application_tables = tables - {ALEMBIC_REVISION_TABLE}
        if current_revision is None and application_tables:
            revision = _legacy_revision(inspector, application_tables)
            command.stamp(config, revision)
        command.upgrade(config, "head")


def _legacy_revision(inspector: Inspector, tables: frozenset[str]) -> str:
    missing = P2_05_TABLES - tables
    if missing:
        names = ", ".join(sorted(missing))
        raise DatabaseMigrationError(
            f"Legacy database is missing required P2-05 tables: {names}."
        )
    column_names = {
        column["name"]
        for column in inspector.get_columns("agent_events")
    }
    run_tables = {"runs", "run_model_snapshots", "tool_calls"}
    if "run_id" in column_names and run_tables <= tables:
        return P2_06_REVISION
    if "run_id" not in column_names and run_tables.isdisjoint(tables):
        return P2_05_REVISION
    raise DatabaseMigrationError(
        "Legacy database contains a partial P2-06 schema and cannot be stamped safely."
    )


def _alembic_config() -> Config:
    migrations_directory = Path(__file__).with_name("migrations")
    config = Config()
    config.set_main_option("script_location", str(migrations_directory))
    return config
