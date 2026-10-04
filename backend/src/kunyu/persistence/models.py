from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
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
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from kunyu.agent.runtime.retry_policy import NormalRetryPolicy


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


class RunRecord(Base):
    __tablename__ = "runs"
    __table_args__ = (
        CheckConstraint(
            "state IN ('ready', 'model_running', 'tool_running', "
            "'waiting_confirmation', 'interrupted', 'completed', 'failed', "
            "'cancelled')",
            name="ck_runs_state",
        ),
        CheckConstraint("step >= 0", name="ck_runs_step_nonnegative"),
        CheckConstraint("attempt >= 0", name="ck_runs_attempt_nonnegative"),
        CheckConstraint(
            "resume_phase IN ('model', 'tool')", name="ck_runs_resume_phase"
        ),
        CheckConstraint(
            "next_tool_index >= 0", name="ck_runs_next_tool_index_nonnegative"
        ),
        CheckConstraint(
            "queue_sequence IS NULL OR queue_sequence > 0",
            name="ck_runs_queue_sequence_positive",
        ),
        CheckConstraint(
            "updated_sequence > 0", name="ck_runs_updated_sequence_positive"
        ),
        CheckConstraint(
            "max_model_calls > 0 AND model_calls >= 0 AND "
            "max_tool_calls > 0 AND tool_calls >= 0 AND "
            "max_active_milliseconds > 0 AND active_milliseconds >= 0 AND "
            "max_output_codepoints > 0 AND output_codepoints >= 0",
            name="ck_runs_budget_nonnegative",
        ),
        ForeignKeyConstraint(
            ["user_message_id", "session_id"],
            ["messages.id", "messages.session_id"],
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
        Index("uq_runs_id_session", "id", "session_id", unique=True),
        Index(
            "uq_runs_session_active",
            "session_id",
            unique=True,
            sqlite_where=sql_text(
                "state IN ('ready', 'model_running', 'tool_running', "
                "'waiting_confirmation', 'interrupted')"
            ),
        ),
        Index("ix_runs_session_created", "session_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    user_message_id: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    step: Mapped[int] = mapped_column(Integer, nullable=False)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False)
    resume_phase: Mapped[str] = mapped_column(String(16), nullable=False)
    next_tool_index: Mapped[int] = mapped_column(Integer, nullable=False)
    requires_resume: Mapped[bool] = mapped_column(Boolean, nullable=False)
    queue_sequence: Mapped[int | None] = mapped_column(Integer)
    pending_confirmation_id: Mapped[str | None] = mapped_column(String(64))
    pause_reason: Mapped[str | None] = mapped_column(String(200))
    max_model_calls: Mapped[int] = mapped_column(Integer, nullable=False)
    model_calls: Mapped[int] = mapped_column(Integer, nullable=False)
    max_tool_calls: Mapped[int] = mapped_column(Integer, nullable=False)
    tool_calls: Mapped[int] = mapped_column(Integer, nullable=False)
    max_active_milliseconds: Mapped[int] = mapped_column(Integer, nullable=False)
    active_milliseconds: Mapped[int] = mapped_column(Integer, nullable=False)
    max_output_codepoints: Mapped[int] = mapped_column(Integer, nullable=False)
    output_codepoints: Mapped[int] = mapped_column(Integer, nullable=False)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    total_tokens: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_sequence: Mapped[int] = mapped_column(Integer, nullable=False)


class RunModelSnapshotRecord(Base):
    __tablename__ = "run_model_snapshots"
    __table_args__ = (
        CheckConstraint(
            "protocol IN ('openai_compatible', 'deepseek_messages')",
            name="ck_run_snapshots_protocol",
        ),
        CheckConstraint(
            "auth_mode IN ('api_key', 'none')", name="ck_run_snapshots_auth_mode"
        ),
        CheckConstraint(
            "max_tokens_field IN ('max_tokens', 'max_completion_tokens')",
            name="ck_run_snapshots_max_tokens_field",
        ),
        CheckConstraint(
            "connection_revision > 0", name="ck_run_snapshots_revision_positive"
        ),
        CheckConstraint(
            "max_output_tokens > 0", name="ck_run_snapshots_output_tokens_positive"
        ),
        ForeignKeyConstraint(
            ["run_id", "session_id"],
            ["runs.id", "runs.session_id"],
            ondelete="CASCADE",
        ),
    )

    run_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False)
    connection_id: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_type: Mapped[str] = mapped_column(String(32), nullable=False)
    protocol: Mapped[str] = mapped_column(String(32), nullable=False)
    base_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    auth_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    model_id: Mapped[str] = mapped_column(String(256), nullable=False)
    reasoning_effort: Mapped[str | None] = mapped_column(String(64))
    connection_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    max_tokens_field: Mapped[str] = mapped_column(String(32), nullable=False)
    include_usage: Mapped[bool] = mapped_column(Boolean, nullable=False)
    max_output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    map_context: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    scene: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class SessionEventRecord(Base):
    __tablename__ = "session_events"
    __table_args__ = (
        CheckConstraint("sequence > 0", name="ck_session_events_sequence_positive"),
        Index(
            "ix_session_events_session_sequence",
            "session_id",
            "sequence",
            unique=True,
        ),
        Index("ix_session_events_run_id", "run_id"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    run_id: Mapped[str | None] = mapped_column(String(64))
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False
    )


class ToolCallRecord(Base):
    __tablename__ = "tool_calls"
    __table_args__ = (
        CheckConstraint("step > 0", name="ck_tool_calls_step_positive"),
        CheckConstraint("attempt > 0", name="ck_tool_calls_attempt_positive"),
        CheckConstraint(
            "batch_index >= 0", name="ck_tool_calls_batch_index_nonnegative"
        ),
        CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed', 'cancelled')",
            name="ck_tool_calls_status",
        ),
        CheckConstraint(
            "updated_sequence > 0", name="ck_tool_calls_updated_sequence_positive"
        ),
        ForeignKeyConstraint(
            ["run_id", "session_id"],
            ["runs.id", "runs.session_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["message_id", "session_id"],
            ["messages.id", "messages.session_id"],
            ondelete="CASCADE",
        ),
        Index(
            "uq_tool_calls_provider_attempt",
            "run_id",
            "step",
            "attempt",
            "provider_call_id",
            unique=True,
        ),
        Index(
            "uq_tool_calls_batch_index",
            "run_id",
            "step",
            "attempt",
            "batch_index",
            unique=True,
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False)
    run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    message_id: Mapped[str] = mapped_column(String(64), nullable=False)
    step: Mapped[int] = mapped_column(Integer, nullable=False)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False)
    provider_call_id: Mapped[str] = mapped_column(String(256), nullable=False)
    batch_index: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    arguments: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    result: Mapped[Any | None] = mapped_column(JSON)
    error_code: Mapped[str | None] = mapped_column(String(100))
    error_summary: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_sequence: Mapped[int] = mapped_column(Integer, nullable=False)


class ConfirmationRecord(Base):
    __tablename__ = "confirmations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'cancelled')",
            name="ck_confirmations_status",
        ),
        CheckConstraint(
            "updated_sequence > 0",
            name="ck_confirmations_updated_sequence_positive",
        ),
        CheckConstraint(
            "(status = 'pending' AND decided_at IS NULL) OR "
            "(status != 'pending' AND decided_at IS NOT NULL)",
            name="ck_confirmations_decision_shape",
        ),
        ForeignKeyConstraint(
            ["run_id", "session_id"],
            ["runs.id", "runs.session_id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "tool_call_id",
            name="uq_confirmations_tool_call_id",
        ),
        Index(
            "ix_confirmations_session_created",
            "session_id",
            "created_at",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False)
    run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    tool_call_id: Mapped[str] = mapped_column(
        ForeignKey("tool_calls.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    arguments: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    side_effect: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_sequence: Mapped[int] = mapped_column(Integer, nullable=False)


class ModelConnectionRecord(Base):
    __tablename__ = "model_connections"
    __table_args__ = (
        CheckConstraint(
            "protocol IN ('openai_compatible', 'deepseek_messages')",
            name="ck_model_connections_protocol",
        ),
        CheckConstraint(
            "provider_type IN ('openai', 'deepseek', 'moonshot', 'zai', "
            "'siliconflow', 'openrouter', 'groq', 'nvidia', 'together', "
            "'deepinfra', 'fireworks', 'alibaba', 'xai', 'mistral', 'ollama', "
            "'lm_studio', 'localai', 'custom')",
            name="ck_model_connections_provider_type",
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
    provider_type: Mapped[str] = mapped_column(String(32), nullable=False)
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
    retry_policy: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: NormalRetryPolicy().model_dump(mode="json"),
    )
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
            "reasoning_source IN ('unknown', 'provider_metadata', 'protocol')",
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
    reasoning_default: Mapped[str | None] = mapped_column(String(64))
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
