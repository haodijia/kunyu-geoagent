"""Execution ORM records."""

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
    UniqueConstraint,
    func,
)
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Mapped, mapped_column

from kunyu.persistence.records.base import Base


class SubagentRecord(Base):
    __tablename__ = "subagents"
    __table_args__ = (
        Index("ix_subagents_parent_created", "parent_session_id", "created_sequence"),
        UniqueConstraint("tool_call_id", name="uq_subagents_tool_call"),
        UniqueConstraint("child_run_id", name="uq_subagents_child_run"),
        CheckConstraint(
            "child_session_id != parent_session_id AND created_sequence > 0",
            name="ck_subagents_identity",
        ),
    )

    child_session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True
    )
    parent_session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    parent_run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    child_run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    tool_call_id: Mapped[str] = mapped_column(String(64), nullable=False)
    created: Mapped[dict] = mapped_column(JSON, nullable=False)
    settled: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    settled_sequence: Mapped[int | None] = mapped_column(Integer)


class RunRecord(Base):
    __tablename__ = "runs"
    __table_args__ = (
        CheckConstraint(
            "state IN ('ready', 'model_running', 'tool_running', "
            "'waiting_confirmation', 'waiting_input', 'interrupted', 'completed', 'failed', "
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
            "model_calls >= 0 AND tool_calls >= 0 AND "
            "max_active_milliseconds > 0 AND active_milliseconds >= 0 AND "
            "output_codepoints >= 0",
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
                "'waiting_confirmation', 'waiting_input', 'interrupted')"
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
    model_calls: Mapped[int] = mapped_column(Integer, nullable=False)
    tool_calls: Mapped[int] = mapped_column(Integer, nullable=False)
    max_active_milliseconds: Mapped[int] = mapped_column(Integer, nullable=False)
    active_milliseconds: Mapped[int] = mapped_column(Integer, nullable=False)
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
            "protocol IN ('openai_compatible', 'deepseek_messages', 'openai_responses')",
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
    reasoning_parameters: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    connection_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    max_tokens_field: Mapped[str] = mapped_column(String(32), nullable=False)
    include_usage: Mapped[bool] = mapped_column(Boolean, nullable=False)
    image_input: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    max_output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    context_window: Mapped[int | None] = mapped_column(Integer)
    retention_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
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
    display: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    compact: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    content: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, server_default="[]"
    )
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
    execution: Mapped[str] = mapped_column(String(32), nullable=False)
    binding: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_sequence: Mapped[int] = mapped_column(Integer, nullable=False)
