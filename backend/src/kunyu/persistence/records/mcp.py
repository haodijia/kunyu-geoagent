"""Mcp ORM records."""

from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from kunyu.persistence.records.base import Base


class McpServerRecord(Base):
    __tablename__ = "mcp_servers"
    __table_args__ = (
        CheckConstraint(
            "revision > 0 AND catalog_revision >= 0", name="ck_mcp_server_revision"
        ),
    )
    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
    secrets: Mapped[dict] = mapped_column(JSON, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    catalog_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    catalog: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class McpOAuthRecord(Base):
    __tablename__ = "mcp_oauth"
    name: Mapped[str] = mapped_column(
        ForeignKey("mcp_servers.name", ondelete="CASCADE"), primary_key=True
    )
    server_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    tokens: Mapped[dict] = mapped_column(JSON, nullable=False)
    client_info: Mapped[dict] = mapped_column(JSON, nullable=False)
    client_metadata: Mapped[dict] = mapped_column(JSON, nullable=False)
    discovery: Mapped[dict] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
