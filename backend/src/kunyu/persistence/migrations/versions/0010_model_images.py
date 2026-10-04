"""Freeze explicitly declared image request policy with catalog entries and runs."""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("model_catalog_entries", "run_model_snapshots"):
        op.add_column(
            table,
            sa.Column(
                "image_input",
                sa.JSON(),
                nullable=False,
                server_default='{"enabled":false,"pixel_budget":null,"max_bytes":2097152}',
            ),
        )


def downgrade() -> None:
    raise RuntimeError("Frozen model input declarations cannot be downgraded.")
