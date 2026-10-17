"""Oge ORM records."""

from sqlalchemy import JSON, CheckConstraint, Integer
from sqlalchemy.orm import Mapped, mapped_column

from kunyu.persistence.records.base import Base


class OgeAccountRecord(Base):
    __tablename__ = "oge_account"
    __table_args__ = (CheckConstraint("id = 1", name="ck_oge_account_singleton"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
