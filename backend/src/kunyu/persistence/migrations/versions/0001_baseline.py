"""Kunyu development database baseline.

Revision ID: 0001
Revises: None
"""

from collections.abc import Sequence
from pathlib import Path

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = Path(__file__).with_name("0001_schema.sql").read_text(encoding="utf-8")
    for statement in schema.split(";"):
        if statement.strip():
            op.get_bind().exec_driver_sql(statement)


def downgrade() -> None:
    raise RuntimeError("The development database baseline cannot be downgraded.")
