"""Persist parent-journal delegation projections."""

import sqlalchemy as sa
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "subagents",
        sa.Column(
            "child_session_id",
            sa.String(64),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "parent_session_id",
            sa.String(64),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("parent_run_id", sa.String(64), nullable=False),
        sa.Column("child_run_id", sa.String(64), nullable=False),
        sa.Column("tool_call_id", sa.String(64), nullable=False),
        sa.Column("created", sa.JSON(), nullable=False),
        sa.Column("settled", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_sequence", sa.Integer(), nullable=False),
        sa.Column("settled_sequence", sa.Integer(), nullable=True),
        sa.UniqueConstraint("tool_call_id", name="uq_subagents_tool_call"),
        sa.UniqueConstraint("child_run_id", name="uq_subagents_child_run"),
        sa.CheckConstraint(
            "child_session_id != parent_session_id AND created_sequence > 0",
            name="ck_subagents_identity",
        ),
    )
    op.create_index(
        "ix_subagents_parent_created",
        "subagents",
        ["parent_session_id", "created_sequence"],
    )


def downgrade() -> None:
    raise RuntimeError("Delegation journals cannot be downgraded.")
