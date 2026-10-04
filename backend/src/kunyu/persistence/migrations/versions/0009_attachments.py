"""Persist session-owned attachment receipts separately from immutable bytes."""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "session_attachments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(64),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("receipt", sa.JSON(), nullable=False),
        sa.Column("source_media_type", sa.String(100)),
        sa.Column("source_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "source_bytes >= 0", name="ck_session_attachments_source_bytes"
        ),
    )
    op.create_index(
        "ix_session_attachments_session_created",
        "session_attachments",
        ["session_id", "created_at"],
    )

    op.add_column(
        "messages",
        sa.Column("attachments", sa.JSON(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    raise RuntimeError("Durable attachment references cannot be downgraded.")
