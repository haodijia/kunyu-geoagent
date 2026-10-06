"""Store explicit output limits without changing accepted run snapshots."""

import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("model_catalog_entries", recreate="always") as batch:
        # Reflection wraps JSON defaults in SQL text; spaces prevent its colons
        # from becoming bound parameters when SQLite rebuilds this table.
        batch.alter_column(
            "image_input",
            server_default='{"enabled": false, "pixel_budget": null, "max_bytes": 2097152}',
        )
        batch.add_column(
            sa.Column(
                "max_output_tokens",
                sa.Integer(),
                nullable=False,
                server_default="16384",
            )
        )
        batch.create_check_constraint(
            "ck_model_catalog_output_tokens",
            "max_output_tokens > 0 AND max_output_tokens <= 100000000",
        )


def downgrade() -> None:
    raise RuntimeError("Declared model output limits cannot be downgraded.")
