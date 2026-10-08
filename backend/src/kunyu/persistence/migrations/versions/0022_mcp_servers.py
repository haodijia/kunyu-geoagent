"""Persist MCP configuration, private credentials and successful catalog identity."""

import sqlalchemy as sa
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mcp_servers",
        sa.Column("name", sa.String(32), primary_key=True),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("secrets", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("catalog_revision", sa.Integer(), nullable=False),
        sa.Column("catalog", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "revision > 0 AND catalog_revision >= 0", name="ck_mcp_server_revision"
        ),
    )


def downgrade() -> None:
    raise RuntimeError("MCP configuration cannot be downgraded.")
