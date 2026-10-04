"""Convert JSON-only tool facts to canonical model-visible result blocks."""

import json

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tool_calls",
        sa.Column("content", sa.JSON(), nullable=False, server_default="[]"),
    )
    connection = op.get_bind()
    events = connection.execute(
        sa.text(
            "SELECT id, payload FROM session_events WHERE event_type = 'tool.completed'"
        )
    ).all()
    for identity, raw in events:
        payload = json.loads(raw)
        content = [
            {
                "type": "text",
                "text": json.dumps(
                    payload["result"],
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                    allow_nan=False,
                ),
            }
        ]
        payload["content"] = content
        connection.execute(
            sa.text("UPDATE session_events SET payload = :payload WHERE id = :id"),
            {"payload": json.dumps(payload, ensure_ascii=False), "id": identity},
        )
        connection.execute(
            sa.text("UPDATE tool_calls SET content = :content WHERE id = :id"),
            {
                "content": json.dumps(content, ensure_ascii=False),
                "id": payload["tool_call_id"],
            },
        )


def downgrade() -> None:
    raise RuntimeError("Canonical tool content cannot be downgraded.")
