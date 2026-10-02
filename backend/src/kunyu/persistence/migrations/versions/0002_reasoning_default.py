"""Persist the provider-declared reasoning default."""

from alembic import op
from sqlalchemy import Column, String, inspect

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The development baseline creates current metadata for new databases.
    columns = inspect(op.get_bind()).get_columns("model_catalog_entries")
    if "reasoning_default" not in {column["name"] for column in columns}:
        op.add_column("model_catalog_entries", Column("reasoning_default", String(64)))


def downgrade() -> None:
    op.drop_column("model_catalog_entries", "reasoning_default")
