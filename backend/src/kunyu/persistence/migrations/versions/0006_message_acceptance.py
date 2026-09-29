"""Persist idempotent message acceptance and session model preferences.

Revision ID: 0006
Revises: 0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "session_preferences",
        sa.Column("session_id", sa.String(64), primary_key=True),
        sa.Column("connection_id", sa.String(64), nullable=False),
        sa.Column("model_id", sa.String(256), nullable=False),
        sa.Column("reasoning_effort", sa.String(64)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
    )
    op.create_table(
        "message_idempotency",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("idempotency_key", sa.String(36), nullable=False),
        sa.Column("normalized_body", sa.Text(), nullable=False),
        sa.Column("message_id", sa.String(64), nullable=False),
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "session_id",
            "idempotency_key",
            name="uq_message_idempotency_session_key",
        ),
    )
    op.create_index(
        "ix_message_idempotency_run_id",
        "message_idempotency",
        ["run_id"],
    )


def downgrade() -> None:
    raise RuntimeError("P2-12 schema downgrade is intentionally unsupported.")
