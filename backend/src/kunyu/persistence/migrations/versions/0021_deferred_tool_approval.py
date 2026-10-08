"""Declare the existing transactional approval path without inventing bindings."""

import json

import sqlalchemy as sa
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "confirmations",
        sa.Column(
            "execution", sa.String(32), nullable=False, server_default="transaction"
        ),
    )
    op.add_column("confirmations", sa.Column("binding", sa.String(1000), nullable=True))
    connection = op.get_bind()
    rows = (
        connection.execute(
            sa.text(
                "SELECT session_id, sequence, payload FROM session_events WHERE event_type='confirmation.requested'"
            )
        )
        .mappings()
        .all()
    )
    for row in rows:
        payload = json.loads(row["payload"])
        payload.update(execution="transaction", binding=None)
        connection.execute(
            sa.text(
                "UPDATE session_events SET payload=:payload WHERE session_id=:sid AND sequence=:seq"
            ),
            {
                "payload": json.dumps(payload, ensure_ascii=False, allow_nan=False),
                "sid": row["session_id"],
                "seq": row["sequence"],
            },
        )


def downgrade() -> None:
    raise RuntimeError("Approval execution boundaries cannot be downgraded.")
