"""Declare ownership and trigger of existing manual auxiliary calls."""

import json

import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    records = (
        connection.execute(
            sa.text(
                "SELECT session_id, sequence, payload FROM session_events WHERE event_type='compaction/start'"
            )
        )
        .mappings()
        .all()
    )
    for record in records:
        payload = json.loads(record["payload"])
        payload.update(trigger="manual", owner_run_id=None, pressure=None)
        connection.execute(
            sa.text(
                "UPDATE session_events SET payload=:payload WHERE session_id=:sid AND sequence=:seq"
            ),
            {
                "payload": json.dumps(payload, ensure_ascii=False, allow_nan=False),
                "sid": record["session_id"],
                "seq": record["sequence"],
            },
        )


def downgrade() -> None:
    raise RuntimeError("Automatic compaction ownership cannot be downgraded.")
