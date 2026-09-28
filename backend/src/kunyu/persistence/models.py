from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy import text as sql_text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


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


class MessageRecord(Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint("sequence > 0", name="ck_messages_sequence_positive"),
        Index(
            "ix_messages_session_sequence",
            "session_id",
            "sequence",
            unique=True,
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False
    )


class AgentEventRecord(Base):
    __tablename__ = "agent_events"
    __table_args__ = (
        CheckConstraint("sequence > 0", name="ck_agent_events_sequence_positive"),
        Index(
            "ix_agent_events_session_sequence",
            "session_id",
            "sequence",
            unique=True,
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False
    )


class ModelConnectionRecord(Base):
    __tablename__ = "model_connections"
    __table_args__ = (
        CheckConstraint(
            "protocol = 'openai_compatible'",
            name="ck_model_connections_protocol",
        ),
        CheckConstraint(
            "auth_mode IN ('api_key', 'none')",
            name="ck_model_connections_auth_mode",
        ),
        CheckConstraint(
            "max_tokens_field IN ('max_tokens', 'max_completion_tokens')",
            name="ck_model_connections_max_tokens_field",
        ),
        CheckConstraint(
            "revision > 0",
            name="ck_model_connections_revision_positive",
        ),
        CheckConstraint(
            "discovery_generation >= 0",
            name="ck_model_connections_discovery_generation_nonnegative",
        ),
        CheckConstraint(
            "check_generation >= 0",
            name="ck_model_connections_check_generation_nonnegative",
        ),
        CheckConstraint(
            "credential_status IN ('ready', 'missing')",
            name="ck_model_connections_credential_status",
        ),
        CheckConstraint(
            "management_status = 'ready'",
            name="ck_model_connections_management_status",
        ),
        CheckConstraint(
            "discovery_status IN "
            "('idle', 'pending', 'succeeded', 'failed', 'interrupted')",
            name="ck_model_connections_discovery_status",
        ),
        Index(
            "uq_model_connections_single_default",
            "is_default",
            unique=True,
            sqlite_where=sql_text("is_default = 1"),
        ),
        Index("ix_model_connections_updated_at", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    protocol: Mapped[str] = mapped_column(String(32), nullable=False)
    base_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    auth_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    default_model_id: Mapped[str | None] = mapped_column(String(256))
    enabled_model_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    max_tokens_field: Mapped[str] = mapped_column(String(32), nullable=False)
    include_usage: Mapped[bool] = mapped_column(Boolean, nullable=False)
    credential_status: Mapped[str] = mapped_column(String(32), nullable=False)
    credential_configured: Mapped[bool] = mapped_column(Boolean, nullable=False)
    credential_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    management_status: Mapped[str] = mapped_column(String(32), nullable=False)
    discovery_status: Mapped[str] = mapped_column(String(32), nullable=False)
    discovery_generation: Mapped[int] = mapped_column(Integer, nullable=False)
    discovery_last_success_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    discovery_error_code: Mapped[str | None] = mapped_column(String(100))
    check_generation: Mapped[int] = mapped_column(Integer, nullable=False)
    catalog_entries: Mapped[list["ModelCatalogEntryRecord"]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    credential_record: Mapped["ModelCredentialRecord | None"] = relationship(
        cascade="all, delete-orphan",
        lazy="joined",
        passive_deletes=True,
        uselist=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False
    )


class ModelCatalogEntryRecord(Base):
    __tablename__ = "model_catalog_entries"
    __table_args__ = (
        CheckConstraint("revision > 0", name="ck_model_catalog_revision_positive"),
        CheckConstraint(
            "availability IN ('available', 'unavailable')",
            name="ck_model_catalog_availability",
        ),
        CheckConstraint(
            "text_check IN ('unchecked', 'passed', 'failed')",
            name="ck_model_catalog_text_check",
        ),
        CheckConstraint(
            "tool_check IN ('unchecked', 'passed', 'failed')",
            name="ck_model_catalog_tool_check",
        ),
        CheckConstraint(
            "tool_capability IN ('unknown', 'supported', 'unsupported')",
            name="ck_model_catalog_tool_capability",
        ),
        CheckConstraint(
            "tool_capability_source IN ('unknown', 'provider_metadata', 'validation')",
            name="ck_model_catalog_tool_capability_source",
        ),
        CheckConstraint(
            "reasoning_source IN ('unknown', 'provider_metadata')",
            name="ck_model_catalog_reasoning_source",
        ),
        Index("ix_model_catalog_connection_revision", "connection_id", "revision"),
    )

    connection_id: Mapped[str] = mapped_column(
        ForeignKey("model_connections.id", ondelete="CASCADE"), primary_key=True
    )
    model_id: Mapped[str] = mapped_column(String(256), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(256))
    sources: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    availability: Mapped[str] = mapped_column(String(32), nullable=False)
    text_check: Mapped[str] = mapped_column(String(32), nullable=False)
    text_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    text_error_code: Mapped[str | None] = mapped_column(String(100))
    tool_check: Mapped[str] = mapped_column(String(32), nullable=False)
    tool_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tool_error_code: Mapped[str | None] = mapped_column(String(100))
    tool_capability: Mapped[str] = mapped_column(String(32), nullable=False)
    tool_capability_source: Mapped[str] = mapped_column(String(32), nullable=False)
    reasoning_efforts: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    reasoning_source: Mapped[str] = mapped_column(String(32), nullable=False)
    discovered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ModelCredentialRecord(Base):
    __tablename__ = "model_credentials"

    connection_id: Mapped[str] = mapped_column(
        ForeignKey("model_connections.id", ondelete="CASCADE"), primary_key=True
    )
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
