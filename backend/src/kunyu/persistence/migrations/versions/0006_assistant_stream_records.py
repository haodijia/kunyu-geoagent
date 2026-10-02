"""Preserve known historical delta facts; original token timing is unavailable."""

import json
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            "SELECT id, run_id, event_type, payload, occurred_at FROM session_events WHERE event_type IN ('message.assistant.started', 'message.assistant.delta', 'message.assistant.reasoning.delta', 'model.attempt.finished') ORDER BY session_id, sequence"
        )
    ).all()
    streams: dict[tuple, list[dict]] = {}
    last_times: dict[tuple, int] = {}
    messages: dict[tuple, str] = {}
    for identity, run_id, event_type, raw, occurred_at in rows:
        payload = json.loads(raw)
        key = (run_id, payload["step"], payload["attempt"])
        if event_type == "message.assistant.started":
            messages[key] = payload["message_id"]
            continue
        records = streams.setdefault(key, [])
        if event_type == "model.attempt.finished":
            payload["message_id"] = messages.pop(key)
            payload["stream"] = records
            payload["stream_origin"] = "buffered"
            connection.execute(
                sa.text(
                    "UPDATE session_events SET payload = :payload WHERE id = :identity"
                ),
                {
                    "payload": json.dumps(payload, ensure_ascii=False),
                    "identity": identity,
                },
            )
            del streams[key]
            last_times.pop(key, None)
            continue
        date = datetime.fromisoformat(occurred_at)
        # SQLAlchemy stores UTC timestamps without an offset in SQLite.
        time = int(date.replace(tzinfo=UTC).timestamp() * 1_000)
        kind = (
            "reasoning-chunks"
            if event_type == "message.assistant.reasoning.delta"
            else "text-chunks"
        )
        if records and records[-1]["type"] == kind:
            records[-1]["dt"].append(time - last_times[key])
            records[-1]["texts"].append(payload["text"])
        else:
            records.append(
                {
                    "type": kind,
                    "time0": time,
                    "index": 0,
                    "dt": [],
                    "texts": [payload["text"]],
                }
            )
        last_times[key] = time


def downgrade() -> None:
    raise RuntimeError("Assistant stream records cannot be downgraded.")
