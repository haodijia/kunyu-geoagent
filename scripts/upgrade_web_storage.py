"""Copy a stopped schema-15 instance into a separate schema-16 web data directory."""

import argparse
import filecmp
import json
import shutil
import sqlite3
from pathlib import Path

from kunyu.domain.mcp import McpServerConfig
from kunyu.persistence.database import create_database_engine
from kunyu.persistence.schema import initialize_database


def copy_files(source: Path, target: Path) -> None:
    if source.is_symlink():
        raise RuntimeError(f"Resolve symbolic links before migration: {source}")
    if source.is_dir():
        target.mkdir(mode=0o700)
        for item in source.iterdir():
            copy_files(item, target / item.name)
    elif source.is_file():
        shutil.copy2(source, target)
        if not filecmp.cmp(source, target, shallow=False):
            raise RuntimeError(f"Copied file differs: {target}")
    else:
        raise RuntimeError(f"Unsupported data entry: {source}")


def upgrade(source: Path, target: Path) -> None:
    if source == target or source in target.parents or target in source.parents:
        raise RuntimeError("Source and destination must be separate directories.")
    if not source.is_dir() or not (source / "kunyu.db").is_file():
        raise RuntimeError("Source must contain a stopped instance's kunyu.db.")
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    if any(target.iterdir()):
        raise RuntimeError("Destination must be empty.")
    original = source / "kunyu.db"
    destination = target / "kunyu.db"
    with sqlite3.connect(original.as_uri() + "?mode=ro", uri=True) as old:
        if old.execute("PRAGMA user_version").fetchone()[0] != 15:
            raise RuntimeError("This explicit upgrade requires schema 15.")
        if old.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise RuntimeError("Source database integrity check failed.")
        destination.touch(mode=0o600, exist_ok=False)
        with sqlite3.connect(destination) as new:
            old.backup(new)
            new.execute("PRAGMA foreign_keys=ON")
            new.execute("BEGIN IMMEDIATE")
            for name, raw in new.execute(
                "SELECT name, config FROM mcp_servers"
            ).fetchall():
                config = json.loads(raw)
                if config.get("oauth") is not None:
                    config["oauth"].pop("callback_port", None)
                    # Desktop registrations name a loopback redirect; web login registers
                    # the configured public callback and obtains fresh credentials.
                    new.execute("DELETE FROM mcp_oauth WHERE name=?", (name,))
                    new.execute(
                        "UPDATE mcp_servers SET config=?, revision=revision+1 WHERE name=?",
                        (json.dumps(config, ensure_ascii=False), name),
                    )
                McpServerConfig.model_validate(config)
            new.execute("PRAGMA user_version=16")
            if new.execute("PRAGMA foreign_key_check").fetchall():
                raise RuntimeError("Upgraded database foreign-key check failed.")
            new.commit()
    excluded = {"kunyu.db", "kunyu.db-wal", "kunyu.db-shm"}
    for item in source.iterdir():
        if item.name not in excluded:
            copy_files(item, target / item.name)
    engine = create_database_engine(destination)
    try:
        initialize_database(engine)
    finally:
        engine.dispose()
    print(f"Web data copied and validated: {target}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    arguments = parser.parse_args()
    upgrade(
        arguments.source.expanduser().resolve(), arguments.target.expanduser().resolve()
    )
