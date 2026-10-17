"""Workspaces ORM records."""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from kunyu.persistence.records.base import Base


class WorkspaceRecord(Base):
    __tablename__ = "workspaces"
    __table_args__ = (Index("ix_workspaces_updated_at", "updated_at"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False
    )


class WorkspaceRemovalRecord(Base):
    __tablename__ = "workspace_removals"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )


class WorkspaceMemoryRecord(Base):
    __tablename__ = "workspace_memories"
    __table_args__ = (
        CheckConstraint(
            "length(content) BETWEEN 1 AND 2000",
            name="ck_workspace_memories_content_length",
        ),
        Index(
            "ix_workspace_memories_workspace_created",
            "workspace_id",
            "created_at",
            "id",
        ),
        UniqueConstraint(
            "source_tool_call_id",
            name="uq_workspace_memories_source_tool_call_id",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_tool_call_id: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
