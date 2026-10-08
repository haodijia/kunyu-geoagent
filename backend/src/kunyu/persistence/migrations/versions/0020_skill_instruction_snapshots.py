"""Expose the exact instruction body of existing explicit skill snapshots."""

import json
from html import escape

import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    records = (
        connection.execute(
            sa.text(
                "SELECT session_id, sequence, payload FROM session_events WHERE event_type='context.injected'"
            )
        )
        .mappings()
        .all()
    )
    for record in records:
        payload = json.loads(record["payload"])
        if payload["producer"] != "skill-invocation":
            continue
        content, metadata = payload["content"], payload["metadata"]
        opening = f'<skill_content name="{escape(metadata["name"], quote=True)}">\n'
        marker, ending = (
            "<skill_instructions>\n",
            "\n</skill_instructions>\n</skill_content>",
        )
        if (
            not content.startswith(opening)
            or marker not in content
            or not content.endswith(ending)
        ):
            raise RuntimeError(
                "Historical skill instructions do not match their recorded frame."
            )
        metadata["content"] = content.split(marker, 1)[1][: -len(ending)]
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
    raise RuntimeError("Recorded skill instruction bodies cannot be downgraded.")
