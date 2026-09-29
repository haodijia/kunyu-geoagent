from functools import cache
from pathlib import Path
from typing import Any

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import Engine, create_engine, inspect
from sqlalchemy.engine import Connection
from sqlalchemy.engine.reflection import Inspector

ALEMBIC_REVISION_TABLE = "alembic_version"
P2_05_REVISION = "0001"
P2_06_REVISION = "0002"
P2_07A_REVISION = "0003"
LEGACY_REVISIONS = (P2_05_REVISION, P2_06_REVISION, P2_07A_REVISION)


class DatabaseMigrationError(RuntimeError):
    pass


def upgrade_database(engine: Engine) -> None:
    config = _alembic_config()
    with engine.connect() as connection:
        _upgrade_connection(connection, config)


def _upgrade_connection(connection: Connection, config: Config) -> None:
    connection.exec_driver_sql("BEGIN IMMEDIATE")
    try:
        config.attributes["connection"] = connection
        inspector = inspect(connection)
        tables = frozenset(inspector.get_table_names())
        current_revision = MigrationContext.configure(connection).get_current_revision()
        application_tables = tables - {ALEMBIC_REVISION_TABLE}
        if current_revision is None and application_tables:
            revision = _legacy_revision(inspector, application_tables)
            command.stamp(config, revision)
        command.upgrade(config, "head")
        connection.commit()
    except Exception:
        connection.rollback()
        raise


def _legacy_revision(inspector: Inspector, tables: frozenset[str]) -> str:
    actual_signature = _schema_signature(inspector, tables)
    for revision in LEGACY_REVISIONS:
        if actual_signature == _revision_schema_signature(revision):
            return revision
    raise DatabaseMigrationError(
        "Unversioned database schema does not exactly match a supported revision."
    )


@cache
def _revision_schema_signature(revision: str) -> tuple[Any, ...]:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    try:
        config = _alembic_config()
        with engine.connect() as connection:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
            config.attributes["connection"] = connection
            command.upgrade(config, revision)
            connection.commit()
            inspector = inspect(connection)
            tables = frozenset(inspector.get_table_names()) - {ALEMBIC_REVISION_TABLE}
            return _schema_signature(inspector, tables)
    finally:
        engine.dispose()


def _schema_signature(
    inspector: Inspector,
    tables: frozenset[str],
) -> tuple[Any, ...]:
    return tuple(
        (
            table,
            tuple(
                (
                    column["name"],
                    str(column["type"]),
                    column["nullable"],
                    column["default"],
                    column["primary_key"],
                )
                for column in inspector.get_columns(table)
            ),
            tuple(inspector.get_pk_constraint(table)["constrained_columns"]),
            tuple(
                sorted(
                    (
                        tuple(foreign_key["constrained_columns"]),
                        foreign_key["referred_table"],
                        tuple(foreign_key["referred_columns"]),
                        tuple(sorted(foreign_key["options"].items())),
                    )
                    for foreign_key in inspector.get_foreign_keys(table)
                )
            ),
            tuple(
                sorted(
                    (
                        index["name"],
                        index["unique"],
                        tuple(index["column_names"]),
                        str(index["dialect_options"].get("sqlite_where", "")),
                    )
                    for index in inspector.get_indexes(table)
                )
            ),
            tuple(
                sorted(
                    (
                        constraint["name"],
                        " ".join(constraint["sqltext"].split()),
                    )
                    for constraint in inspector.get_check_constraints(table)
                )
            ),
        )
        for table in sorted(tables)
    )


def _alembic_config() -> Config:
    migrations_directory = Path(__file__).with_name("migrations")
    config = Config()
    config.set_main_option("script_location", str(migrations_directory))
    return config
