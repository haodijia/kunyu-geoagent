"""Remove cumulative call/output limits while preserving development history."""

import argparse
import json
import sqlite3
from pathlib import Path

from kunyu.agent.runtime.events import validate_event_draft
from kunyu.persistence.schema import SCHEMA_PATH, SCHEMA_VERSION, _statements


def upgrade(database: Path) -> Path:
    if not database.is_file():
        raise RuntimeError("The database must already exist.")
    with sqlite3.connect(database) as source:
        version = source.execute("PRAGMA user_version").fetchone()[0]
        if version not in {2, 3}:
            raise RuntimeError(
                "This explicit migration requires schema version 2 or 3."
            )
        if source.execute(
            "SELECT 1 FROM runs WHERE state IN ('model_running', 'tool_running')"
        ).fetchone():
            raise RuntimeError("Close the application and settle active runs first.")
        backup = database.with_name("kunyu.before-run-limits.db")
        backup.touch(mode=0o600, exist_ok=False)
        with sqlite3.connect(backup) as target:
            source.backup(target)

        source.execute("PRAGMA foreign_keys=OFF")
        source.execute("BEGIN IMMEDIATE")
        statements = tuple(_statements(SCHEMA_PATH.read_text(encoding="utf-8")))
        create_runs = next(s for s in statements if 'CREATE TABLE "runs" (' in s)
        source.execute(
            create_runs.replace('CREATE TABLE "runs" (', "CREATE TABLE runs_new (", 1)
        )
        columns = ", ".join(
            f'"{row[1]}"' for row in source.execute("PRAGMA table_info(runs_new)")
        )
        source.execute(f"INSERT INTO runs_new ({columns}) SELECT {columns} FROM runs")
        source.execute("DROP TABLE runs")
        source.execute("ALTER TABLE runs_new RENAME TO runs")
        for statement in statements:
            if (
                "CREATE " in statement
                and "INDEX " in statement
                and " ON runs " in statement
            ):
                source.execute(statement)

        events = source.execute(
            "SELECT id, session_id, run_id, event_type, payload, occurred_at "
            "FROM session_events WHERE event_type IN "
            "('run.created', 'run.model_selected', 'agent/inbox/spliced')"
        ).fetchall()
        for (
            event_id,
            session_id,
            run_id,
            event_type,
            raw_payload,
            occurred_at,
        ) in events:
            payload = json.loads(raw_payload)
            limits = (
                [payload["budget_limits"]]
                if event_type != "agent/inbox/spliced"
                else [
                    message["turn"]["budget_limits"]
                    for message in payload["messages"]
                    if message.get("turn") is not None
                ]
            )
            for limit in limits:
                del limit["output_codepoints"]
                if version == 2:
                    del limit["model_calls"], limit["tool_calls"]
            validate_event_draft(
                {
                    "session_id": session_id,
                    "run_id": run_id,
                    "event_type": event_type,
                    "payload": payload,
                    "occurred_at": occurred_at,
                }
            )
            source.execute(
                "UPDATE session_events SET payload=? WHERE id=?",
                (json.dumps(payload, ensure_ascii=False), event_id),
            )
        if source.execute("PRAGMA foreign_key_check").fetchall():
            raise RuntimeError("Foreign key integrity check failed.")
        source.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
        source.commit()
    return backup


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    backup = upgrade(args.database)
    print(f"Upgraded to schema {SCHEMA_VERSION}; preserved backup at {backup}")


if __name__ == "__main__":
    main()
