"""Kunyu development database baseline.

Revision ID: 0001
Revises: None
"""

from collections.abc import Sequence

from alembic import op

from kunyu.persistence.models import Base

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    for table in reversed(Base.metadata.sorted_tables):
        table.drop(bind=op.get_bind(), checkfirst=True)
