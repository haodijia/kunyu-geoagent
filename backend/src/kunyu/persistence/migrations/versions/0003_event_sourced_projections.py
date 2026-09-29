"""Make the Agent event log self-contained and projection-independent.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    missing_messages = connection.scalar(
        sa.text(
            """
            SELECT COUNT(*)
            FROM agent_events AS event
            WHERE event.event_type = 'message.user.appended'
              AND NOT EXISTS (
                  SELECT 1
                  FROM messages AS message
                  WHERE message.id = json_extract(event.payload, '$.message_id')
                    AND message.session_id = event.session_id
                    AND message.role = 'user'
              )
            """
        )
    )
    if missing_messages:
        raise RuntimeError(
            "Cannot close user message events because a source projection is missing."
        )

    op.execute(
        """
        UPDATE agent_events
        SET payload = json_set(
            payload,
            '$.content', (
                SELECT message.content
                FROM messages AS message
                WHERE message.id = json_extract(agent_events.payload, '$.message_id')
                  AND message.session_id = agent_events.session_id
                  AND message.role = 'user'
            ),
            '$.run_id', run_id
        )
        WHERE event_type = 'message.user.appended'
        """
    )

    op.rename_table("agent_events", "agent_events_p2_07")
    op.create_table(
        "agent_events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("run_id", sa.String(64)),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "sequence > 0", name="ck_agent_events_sequence_positive"
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], ondelete="CASCADE"
        ),
    )
    op.execute(
        """
        INSERT INTO agent_events (
            id, session_id, sequence, event_type, payload, run_id, occurred_at
        )
        SELECT id, session_id, sequence, event_type, payload, run_id, occurred_at
        FROM agent_events_p2_07
        ORDER BY session_id, sequence
        """
    )
    op.drop_table("agent_events_p2_07")
    op.create_index(
        "ix_agent_events_session_sequence",
        "agent_events",
        ["session_id", "sequence"],
        unique=True,
    )
    op.create_index(
        "ix_agent_events_run_id",
        "agent_events",
        ["run_id"],
    )


def downgrade() -> None:
    raise RuntimeError("P2-07A schema downgrade is intentionally unsupported.")
