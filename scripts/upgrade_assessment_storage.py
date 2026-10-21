"""Explicit, backed-up version-12 upgrade using the unified version-13 SQL."""

import argparse
import sqlite3
from pathlib import Path

from kunyu.persistence.schema import SCHEMA_PATH, _statements


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    args.database = args.database.expanduser().resolve(strict=True)
    backup = args.database.with_name("kunyu-before-assessments.db")
    if backup.exists():
        raise FileExistsError(backup)
    with sqlite3.connect(args.database.as_uri() + "?mode=rw", uri=True) as connection:
        if connection.execute("PRAGMA user_version").fetchone()[0] != 12:
            raise ValueError("Only schema version 12 can be upgraded")
        backup.touch(mode=0o600, exist_ok=False)
        with sqlite3.connect(backup) as archive:
            connection.backup(archive)
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("BEGIN IMMEDIATE")
        for statement in _statements(SCHEMA_PATH.read_text()):
            if statement.lstrip().startswith(
                (
                    "CREATE TABLE study_areas",
                    "CREATE TABLE assessments",
                    "CREATE INDEX ix_assessments_workspace_created",
                )
            ):
                connection.execute(statement)
        connection.execute("PRAGMA user_version=13")
        if connection.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Foreign key integrity check failed")
        connection.commit()
    print(f"Upgraded to version 13; backup: {backup}")


if __name__ == "__main__":
    main()
