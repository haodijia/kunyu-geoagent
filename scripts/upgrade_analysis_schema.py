"""Explicitly upgrade the development DB to the single analysis SQL baseline."""

import argparse
import sqlite3
from pathlib import Path

from kunyu.persistence.schema import SCHEMA_PATH, _statements

NEW_TABLES = ("analysis_jobs", "analysis_outputs", "map_states", "map_layers")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    if not args.database.is_file():
        raise RuntimeError("The database must already exist.")
    with sqlite3.connect(args.database) as source:
        version = source.execute("PRAGMA user_version").fetchone()[0]
        if version != 1:
            raise RuntimeError(
                "This explicit migration requires development schema version 1."
            )
        backup = args.database.with_name("kunyu.before-analysis.db")
        backup.touch(mode=0o600, exist_ok=False)
        with sqlite3.connect(backup) as target:
            source.backup(target)
        source.execute("PRAGMA foreign_keys=ON")
        source.execute("BEGIN IMMEDIATE")
        for statement in _statements(SCHEMA_PATH.read_text()):
            if any(
                f"CREATE TABLE {name} " in statement or f" ON {name} " in statement
                for name in NEW_TABLES
            ):
                source.execute(statement)
        source.execute("PRAGMA user_version=2")
        if source.execute("PRAGMA foreign_key_check").fetchall():
            raise RuntimeError("Foreign key integrity check failed.")
        source.commit()
        print(f"Upgraded to schema 2; preserved backup at {backup}")


if __name__ == "__main__":
    main()
