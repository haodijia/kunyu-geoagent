"""Persist runs, Assistant messages, tool calls, and ordered run events.

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    _prepare_messages()
    _create_run_tables()
    _copy_messages()
    _upgrade_agent_events()


def _prepare_messages() -> None:
    op.rename_table("messages", "messages_p2_05")
    op.drop_index(
        "ix_messages_session_sequence", table_name="messages_p2_05"
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("run_id", sa.String(64)),
        sa.Column("step", sa.Integer()),
        sa.Column("attempt", sa.Integer()),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("content_length", sa.Integer(), nullable=False),
        sa.Column("updated_sequence", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.CheckConstraint("sequence > 0", name="ck_messages_sequence_positive"),
        sa.CheckConstraint(
            "role IN ('user', 'assistant')", name="ck_messages_role"
        ),
        sa.CheckConstraint(
            "status IN ('streaming', 'completed', 'interrupted', 'failed', "
            "'cancelled')",
            name="ck_messages_status",
        ),
        sa.CheckConstraint(
            "content_length >= 0", name="ck_messages_content_length_nonnegative"
        ),
        sa.CheckConstraint(
            "updated_sequence > 0", name="ck_messages_updated_sequence_positive"
        ),
        sa.CheckConstraint(
            "(role = 'user' AND step IS NULL AND attempt IS NULL AND "
            "status = 'completed') OR "
            "(role = 'assistant' AND run_id IS NOT NULL AND step > 0 AND attempt > 0)",
            name="ck_messages_role_shape",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["run_id", "session_id"],
            ["runs.id", "runs.session_id"],
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
    )
    op.create_index(
        "ix_messages_session_sequence",
        "messages",
        ["session_id", "sequence"],
        unique=True,
    )
    op.create_index(
        "uq_messages_id_session",
        "messages",
        ["id", "session_id"],
        unique=True,
    )
    op.create_index(
        "uq_messages_assistant_attempt",
        "messages",
        ["run_id", "step", "attempt"],
        unique=True,
        sqlite_where=sa.text("role = 'assistant'"),
    )


def _copy_messages() -> None:
    op.execute(
        """
        INSERT INTO messages (
            id, session_id, sequence, role, content, run_id, step, attempt,
            status, content_length, updated_sequence, created_at, updated_at
        )
        SELECT
            message.id,
            message.session_id,
            message.sequence,
            message.role,
            message.content,
            NULL,
            NULL,
            NULL,
            'completed',
            length(message.content),
            COALESCE((
                SELECT MAX(event.sequence)
                FROM agent_events AS event
                WHERE event.session_id = message.session_id
                  AND json_extract(event.payload, '$.message_id') = message.id
            ), 1),
            message.created_at,
            message.created_at
        FROM messages_p2_05 AS message
        """
    )
    op.drop_table("messages_p2_05")


def _create_run_tables() -> None:
    op.create_table(
        "runs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("user_message_id", sa.String(64), nullable=False),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("step", sa.Integer(), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("resume_phase", sa.String(16), nullable=False),
        sa.Column("next_tool_index", sa.Integer(), nullable=False),
        sa.Column("requires_resume", sa.Boolean(), nullable=False),
        sa.Column("queue_sequence", sa.Integer()),
        sa.Column("pending_confirmation_id", sa.String(64)),
        sa.Column("pause_reason", sa.String(200)),
        sa.Column("max_model_calls", sa.Integer(), nullable=False),
        sa.Column("model_calls", sa.Integer(), nullable=False),
        sa.Column("max_tool_calls", sa.Integer(), nullable=False),
        sa.Column("tool_calls", sa.Integer(), nullable=False),
        sa.Column("max_active_milliseconds", sa.Integer(), nullable=False),
        sa.Column("active_milliseconds", sa.Integer(), nullable=False),
        sa.Column("max_output_codepoints", sa.Integer(), nullable=False),
        sa.Column("output_codepoints", sa.Integer(), nullable=False),
        sa.Column("input_tokens", sa.Integer()),
        sa.Column("output_tokens", sa.Integer()),
        sa.Column("total_tokens", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_sequence", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "state IN ('ready', 'model_running', 'tool_running', "
            "'waiting_confirmation', 'interrupted', 'completed', 'failed', "
            "'cancelled')",
            name="ck_runs_state",
        ),
        sa.CheckConstraint("step >= 0", name="ck_runs_step_nonnegative"),
        sa.CheckConstraint("attempt >= 0", name="ck_runs_attempt_nonnegative"),
        sa.CheckConstraint(
            "resume_phase IN ('model', 'tool')", name="ck_runs_resume_phase"
        ),
        sa.CheckConstraint(
            "next_tool_index >= 0", name="ck_runs_next_tool_index_nonnegative"
        ),
        sa.CheckConstraint(
            "queue_sequence IS NULL OR queue_sequence > 0",
            name="ck_runs_queue_sequence_positive",
        ),
        sa.CheckConstraint(
            "updated_sequence > 0", name="ck_runs_updated_sequence_positive"
        ),
        sa.CheckConstraint(
            "max_model_calls > 0 AND model_calls >= 0 AND "
            "max_tool_calls > 0 AND tool_calls >= 0 AND "
            "max_active_milliseconds > 0 AND active_milliseconds >= 0 AND "
            "max_output_codepoints > 0 AND output_codepoints >= 0",
            name="ck_runs_budget_nonnegative",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_message_id", "session_id"],
            ["messages.id", "messages.session_id"],
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
    )
    op.create_index(
        "uq_runs_id_session", "runs", ["id", "session_id"], unique=True
    )
    op.create_index(
        "uq_runs_session_active",
        "runs",
        ["session_id"],
        unique=True,
        sqlite_where=sa.text(
            "state IN ('ready', 'model_running', 'tool_running', "
            "'waiting_confirmation', 'interrupted')"
        ),
    )
    op.create_index(
        "ix_runs_session_created", "runs", ["session_id", "created_at"]
    )
    _create_run_snapshot_table()
    _create_tool_call_table()


def _create_run_snapshot_table() -> None:
    op.create_table(
        "run_model_snapshots",
        sa.Column("run_id", sa.String(64), primary_key=True),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("connection_id", sa.String(64), nullable=False),
        sa.Column("provider_type", sa.String(32), nullable=False),
        sa.Column("protocol", sa.String(32), nullable=False),
        sa.Column("base_url", sa.String(2048), nullable=False),
        sa.Column("auth_mode", sa.String(32), nullable=False),
        sa.Column("model_id", sa.String(256), nullable=False),
        sa.Column("reasoning_effort", sa.String(64)),
        sa.Column("connection_revision", sa.Integer(), nullable=False),
        sa.Column("max_tokens_field", sa.String(32), nullable=False),
        sa.Column("include_usage", sa.Boolean(), nullable=False),
        sa.Column("max_output_tokens", sa.Integer(), nullable=False),
        sa.Column("map_context", sa.JSON(), nullable=False),
        sa.Column("scene", sa.JSON()),
        sa.CheckConstraint(
            "protocol = 'openai_compatible'", name="ck_run_snapshots_protocol"
        ),
        sa.CheckConstraint(
            "auth_mode IN ('api_key', 'none')", name="ck_run_snapshots_auth_mode"
        ),
        sa.CheckConstraint(
            "max_tokens_field IN ('max_tokens', 'max_completion_tokens')",
            name="ck_run_snapshots_max_tokens_field",
        ),
        sa.CheckConstraint(
            "connection_revision > 0", name="ck_run_snapshots_revision_positive"
        ),
        sa.CheckConstraint(
            "max_output_tokens > 0", name="ck_run_snapshots_output_tokens_positive"
        ),
        sa.ForeignKeyConstraint(
            ["run_id", "session_id"],
            ["runs.id", "runs.session_id"],
            ondelete="CASCADE",
        ),
    )


def _create_tool_call_table() -> None:
    op.create_table(
        "tool_calls",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("run_id", sa.String(64), nullable=False),
        sa.Column("message_id", sa.String(64), nullable=False),
        sa.Column("step", sa.Integer(), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("provider_call_id", sa.String(256), nullable=False),
        sa.Column("batch_index", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("arguments", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("result", sa.JSON()),
        sa.Column("error_code", sa.String(100)),
        sa.Column("error_summary", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_sequence", sa.Integer(), nullable=False),
        sa.CheckConstraint("step > 0", name="ck_tool_calls_step_positive"),
        sa.CheckConstraint("attempt > 0", name="ck_tool_calls_attempt_positive"),
        sa.CheckConstraint(
            "batch_index >= 0", name="ck_tool_calls_batch_index_nonnegative"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed', 'cancelled')",
            name="ck_tool_calls_status",
        ),
        sa.CheckConstraint(
            "updated_sequence > 0", name="ck_tool_calls_updated_sequence_positive"
        ),
        sa.ForeignKeyConstraint(
            ["run_id", "session_id"],
            ["runs.id", "runs.session_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["message_id", "session_id"],
            ["messages.id", "messages.session_id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "uq_tool_calls_provider_attempt",
        "tool_calls",
        ["run_id", "step", "attempt", "provider_call_id"],
        unique=True,
    )
    op.create_index(
        "uq_tool_calls_batch_index",
        "tool_calls",
        ["run_id", "step", "attempt", "batch_index"],
        unique=True,
    )


def _upgrade_agent_events() -> None:
    op.rename_table("agent_events", "agent_events_p2_05")
    op.create_table(
        "agent_events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("run_id", sa.String(64)),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "sequence > 0", name="ck_agent_events_sequence_positive"
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["run_id", "session_id"],
            ["runs.id", "runs.session_id"],
            ondelete="CASCADE",
        ),
    )
    op.execute(
        """
        INSERT INTO agent_events (
            id, session_id, sequence, event_type, payload, run_id, occurred_at
        )
        SELECT id, session_id, sequence, event_type, payload, NULL, occurred_at
        FROM agent_events_p2_05
        """
    )
    op.drop_table("agent_events_p2_05")
    op.create_index(
        "ix_agent_events_session_sequence",
        "agent_events",
        ["session_id", "sequence"],
        unique=True,
    )


def downgrade() -> None:
    raise RuntimeError("P2-06 schema downgrade is intentionally unsupported.")
