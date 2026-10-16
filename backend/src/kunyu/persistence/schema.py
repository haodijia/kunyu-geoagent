"""Initialize and validate the single development database baseline."""

import sqlite3
from pathlib import Path

from sqlalchemy import Engine, inspect

from kunyu.persistence.models import Base

SCHEMA_VERSION = 4
SCHEMA_PATH = Path(__file__).with_name("schema.sql")


class DatabaseSchemaError(RuntimeError):
    pass


def initialize_database(engine: Engine) -> None:
    with engine.connect() as connection:
        connection.exec_driver_sql("BEGIN IMMEDIATE")
        tables = set(inspect(connection).get_table_names())
        version = connection.exec_driver_sql("PRAGMA user_version").scalar_one()
        if tables:
            if version != SCHEMA_VERSION:
                raise DatabaseSchemaError(
                    "Unsupported development database schema. Preserve this database "
                    "and use a new KUNYU_APP_DATA_DIR or explicitly recreate it; "
                    "automatic legacy migration is no longer provided."
                )
        else:
            if version != 0:
                raise DatabaseSchemaError(
                    "An empty database has an unknown schema version."
                )
            for statement in _statements(SCHEMA_PATH.read_text(encoding="utf-8")):
                connection.exec_driver_sql(statement)
            if (
                connection.exec_driver_sql("PRAGMA user_version").scalar_one()
                != SCHEMA_VERSION
            ):
                raise DatabaseSchemaError(
                    "The SQL baseline has an invalid schema version."
                )
        inspector = inspect(connection)
        if set(inspector.get_table_names()) != set(Base.metadata.tables):
            raise DatabaseSchemaError("Database tables differ from the SQL baseline.")
        for name, table in Base.metadata.tables.items():
            if {column["name"] for column in inspector.get_columns(name)} != set(
                table.columns.keys()
            ):
                raise DatabaseSchemaError(
                    f"Database columns differ from the baseline: {name}."
                )
        if connection.exec_driver_sql("PRAGMA foreign_key_check").all():
            raise DatabaseSchemaError("Database foreign-key integrity check failed.")
        connection.commit()


def _statements(script: str):
    pending = ""
    for line in script.splitlines(keepends=True):
        pending += line
        if sqlite3.complete_statement(pending):
            yield pending
            pending = ""
    if pending.strip():
        raise DatabaseSchemaError("The SQL baseline ends with an incomplete statement.")
