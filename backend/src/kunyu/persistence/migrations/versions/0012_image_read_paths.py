"""Migrate image-read presentation metadata to resolved filesystem paths."""

import json

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    tool_ids = set(
        connection.execute(
            sa.text("SELECT id FROM tool_calls WHERE name = 'read_image'")
        ).scalars()
    )
    events = connection.execute(
        sa.text(
            "SELECT id, payload FROM session_events WHERE event_type = 'tool.completed'"
        )
    ).all()
    for identity, raw in events:
        payload = json.loads(raw)
        if payload["tool_call_id"] not in tool_ids:
            continue
        images = [
            block["attachment"]
            for block in payload["content"]
            if block["type"] == "image"
        ]
        if len(images) != 1:
            raise RuntimeError(
                "Image read migration requires exactly one canonical image receipt."
            )
        ref = images[0]
        result = {"path": f"/attachments/{ref['id']}/{ref['name']}"}
        payload["result"] = result
        connection.execute(
            sa.text("UPDATE session_events SET payload = :payload WHERE id = :id"),
            {"payload": json.dumps(payload, ensure_ascii=False), "id": identity},
        )
        connection.execute(
            sa.text("UPDATE tool_calls SET result = :result WHERE id = :id"),
            {
                "result": json.dumps(result, ensure_ascii=False),
                "id": payload["tool_call_id"],
            },
        )


def downgrade() -> None:
    raise RuntimeError("Image read paths cannot be downgraded.")
