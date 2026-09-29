"""Persist confirmed workspace memories.

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workspace_memories",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("workspace_id", sa.String(64), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_tool_call_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(content) BETWEEN 1 AND 2000",
            name="ck_workspace_memories_content_length",
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.UniqueConstraint(
            "source_tool_call_id",
            name="uq_workspace_memories_source_tool_call_id",
        ),
    )
    op.create_index(
        "ix_workspace_memories_workspace_created",
        "workspace_memories",
        ["workspace_id", "created_at", "id"],
    )


def downgrade() -> None:
    raise RuntimeError("P2-08 schema downgrade is intentionally unsupported.")
