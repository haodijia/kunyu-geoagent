"""Conversation ORM records."""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from kunyu.persistence.records.base import Base


class SessionArchiveRecord(Base):
    __tablename__ = "session_archives"

    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True
    )


class SessionRecord(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        Index("ix_sessions_workspace_updated_at", "workspace_id", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    archive: Mapped[SessionArchiveRecord | None] = relationship(
        lazy="joined", passive_deletes="all"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False
    )


class SessionAttachmentRecord(Base):
    __tablename__ = "session_attachments"
    __table_args__ = (
        Index("ix_session_attachments_session_created", "session_id", "created_at"),
        CheckConstraint(
            "source_bytes >= 0", name="ck_session_attachments_source_bytes"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    receipt: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    source_media_type: Mapped[str | None] = mapped_column(String(100))
    source_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class SessionPreferenceRecord(Base):
    __tablename__ = "session_preferences"

    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True
    )
    connection_id: Mapped[str] = mapped_column(String(64), nullable=False)
    model_id: Mapped[str] = mapped_column(String(256), nullable=False)
    reasoning_effort: Mapped[str | None] = mapped_column(String(64))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class MessageIdempotencyRecord(Base):
    __tablename__ = "message_idempotency"
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "idempotency_key",
            name="uq_message_idempotency_session_key",
        ),
        Index("ix_message_idempotency_run_id", "run_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    idempotency_key: Mapped[str] = mapped_column(String(36), nullable=False)
    normalized_body: Mapped[str] = mapped_column(Text, nullable=False)
    message_id: Mapped[str] = mapped_column(String(64), nullable=False)
    run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class MessageRecord(Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint("sequence > 0", name="ck_messages_sequence_positive"),
        CheckConstraint("role IN ('user', 'assistant')", name="ck_messages_role"),
        CheckConstraint(
            "status IN ('streaming', 'completed', 'interrupted', 'failed', "
            "'cancelled')",
            name="ck_messages_status",
        ),
        CheckConstraint(
            "content_length >= 0", name="ck_messages_content_length_nonnegative"
        ),
        CheckConstraint(
            "updated_sequence > 0", name="ck_messages_updated_sequence_positive"
        ),
        CheckConstraint(
            "(role = 'user' AND step IS NULL AND attempt IS NULL AND "
            "status IN ('completed', 'cancelled')) OR "
            "(role = 'assistant' AND run_id IS NOT NULL AND step > 0 AND attempt > 0)",
            name="ck_messages_role_shape",
        ),
        ForeignKeyConstraint(
            ["run_id", "session_id"],
            ["runs.id", "runs.session_id"],
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
        Index("uq_messages_id_session", "id", "session_id", unique=True),
        Index(
            "ix_messages_session_sequence",
            "session_id",
            "sequence",
            unique=True,
        ),
        Index(
            "uq_messages_assistant_attempt",
            "run_id",
            "step",
            "attempt",
            unique=True,
            sqlite_where=sql_text("role = 'assistant'"),
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    attachments: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    run_id: Mapped[str | None] = mapped_column(String(64))
    step: Mapped[int | None] = mapped_column(Integer)
    attempt: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    content_length: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False
    )
