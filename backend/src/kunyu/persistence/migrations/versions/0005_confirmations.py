"""Persist exact tool confirmation projections.

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "confirmations",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("tool_call_id", sa.String(64), nullable=False),
        sa.Column("workspace_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("arguments", sa.JSON(), nullable=False),
        sa.Column("summary", sa.String(500), nullable=False),
        sa.Column("side_effect", sa.String(500), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_sequence", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'cancelled')",
            name="ck_confirmations_status",
        ),
        sa.CheckConstraint(
            "updated_sequence > 0",
            name="ck_confirmations_updated_sequence_positive",
        ),
        sa.CheckConstraint(
            "(status = 'pending' AND decided_at IS NULL) OR "
            "(status != 'pending' AND decided_at IS NOT NULL)",
            name="ck_confirmations_decision_shape",
        ),
        sa.ForeignKeyConstraint(
            ["run_id", "session_id"],
            ["runs.id", "runs.session_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tool_call_id"], ["tool_calls.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.UniqueConstraint(
            "tool_call_id",
            name="uq_confirmations_tool_call_id",
        ),
    )
    op.create_index(
        "ix_confirmations_session_created",
        "confirmations",
        ["session_id", "created_at"],
    )


def downgrade() -> None:
    raise RuntimeError("P2-09 schema downgrade is intentionally unsupported.")
