"""Back up the version-13 development database and retire fixed assessment storage."""

import argparse
import sqlite3
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    path = parser.parse_args().database.expanduser().resolve(strict=True)
    backup = path.with_name("kunyu-before-result-flow.db")
    if backup.exists():
        raise FileExistsError(backup)
    with sqlite3.connect(path.as_uri() + "?mode=rw", uri=True) as connection:
        if connection.execute("PRAGMA user_version").fetchone()[0] != 13:
            raise ValueError("Only schema version 13 can be upgraded")
        if connection.execute("SELECT COUNT(*) FROM assessments").fetchone()[0]:
            raise ValueError(
                "Export existing assessment records before retiring this storage"
            )
        backup.touch(mode=0o600, exist_ok=False)
        with sqlite3.connect(backup) as archive:
            connection.backup(archive)
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("DROP TABLE assessments")
        connection.execute("DROP TABLE study_areas")
        connection.execute("PRAGMA user_version=14")
        if connection.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Foreign key integrity check failed")
        connection.commit()
    print(f"Upgraded to version 14; backup: {backup}")


if __name__ == "__main__":
    main()
