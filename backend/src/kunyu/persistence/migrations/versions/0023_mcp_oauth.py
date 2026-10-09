"""Add private OAuth records; existing MCP connections keep header authentication."""

import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mcp_oauth",
        sa.Column(
            "name",
            sa.String(32),
            sa.ForeignKey("mcp_servers.name", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("server_url", sa.String(2048), nullable=False),
        sa.Column("tokens", sa.JSON(), nullable=False),
        sa.Column("client_info", sa.JSON(), nullable=False),
        sa.Column("client_metadata", sa.JSON(), nullable=False),
        sa.Column("discovery", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute(
        "UPDATE mcp_servers SET config=json_set(config, '$.auth_mode', 'headers', '$.oauth', json('null'))"
    )


def downgrade() -> None:
    raise RuntimeError("OAuth credentials cannot be downgraded.")
