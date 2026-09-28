"""P2-05 database baseline.

Revision ID: 0001
Revises: None
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
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
    )
    op.create_index("ix_workspaces_updated_at", "workspaces", ["updated_at"])
    op.create_table(
        "workspace_removals",
        sa.Column(
            "workspace_id",
            sa.String(64),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(64),
            sa.ForeignKey("workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
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
    )
    op.create_index(
        "ix_sessions_workspace_updated_at",
        "sessions",
        ["workspace_id", "updated_at"],
    )
    op.create_table(
        "session_archives",
        sa.Column(
            "session_id",
            sa.String(64),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(64),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.CheckConstraint("sequence > 0", name="ck_messages_sequence_positive"),
    )
    op.create_index(
        "ix_messages_session_sequence",
        "messages",
        ["session_id", "sequence"],
        unique=True,
    )
    op.create_table(
        "agent_events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(64),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "sequence > 0", name="ck_agent_events_sequence_positive"
        ),
    )
    op.create_index(
        "ix_agent_events_session_sequence",
        "agent_events",
        ["session_id", "sequence"],
        unique=True,
    )
    _create_model_tables()


def _create_model_tables() -> None:
    op.create_table(
        "model_connections",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("provider_type", sa.String(32), nullable=False),
        sa.Column("protocol", sa.String(32), nullable=False),
        sa.Column("base_url", sa.String(2048), nullable=False),
        sa.Column("auth_mode", sa.String(32), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("default_model_id", sa.String(256)),
        sa.Column("enabled_model_ids", sa.JSON(), nullable=False),
        sa.Column("max_tokens_field", sa.String(32), nullable=False),
        sa.Column("include_usage", sa.Boolean(), nullable=False),
        sa.Column("credential_status", sa.String(32), nullable=False),
        sa.Column("credential_configured", sa.Boolean(), nullable=False),
        sa.Column("credential_updated_at", sa.DateTime(timezone=True)),
        sa.Column("management_status", sa.String(32), nullable=False),
        sa.Column("discovery_status", sa.String(32), nullable=False),
        sa.Column("discovery_generation", sa.Integer(), nullable=False),
        sa.Column("discovery_last_success_at", sa.DateTime(timezone=True)),
        sa.Column("discovery_error_code", sa.String(100)),
        sa.Column("check_generation", sa.Integer(), nullable=False),
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
        sa.CheckConstraint(
            "protocol = 'openai_compatible'",
            name="ck_model_connections_protocol",
        ),
        sa.CheckConstraint(
            "provider_type IN ('openai', 'deepseek', 'moonshot', 'zai', "
            "'siliconflow', 'openrouter', 'groq', 'nvidia', 'together', "
            "'deepinfra', 'fireworks', 'alibaba', 'xai', 'mistral', 'ollama', "
            "'lm_studio', 'localai', 'custom')",
            name="ck_model_connections_provider_type",
        ),
        sa.CheckConstraint(
            "auth_mode IN ('api_key', 'none')",
            name="ck_model_connections_auth_mode",
        ),
        sa.CheckConstraint(
            "max_tokens_field IN ('max_tokens', 'max_completion_tokens')",
            name="ck_model_connections_max_tokens_field",
        ),
        sa.CheckConstraint(
            "revision > 0", name="ck_model_connections_revision_positive"
        ),
        sa.CheckConstraint(
            "discovery_generation >= 0",
            name="ck_model_connections_discovery_generation_nonnegative",
        ),
        sa.CheckConstraint(
            "check_generation >= 0",
            name="ck_model_connections_check_generation_nonnegative",
        ),
        sa.CheckConstraint(
            "credential_status IN ('ready', 'missing')",
            name="ck_model_connections_credential_status",
        ),
        sa.CheckConstraint(
            "management_status = 'ready'",
            name="ck_model_connections_management_status",
        ),
        sa.CheckConstraint(
            "discovery_status IN "
            "('idle', 'pending', 'succeeded', 'failed', 'interrupted')",
            name="ck_model_connections_discovery_status",
        ),
    )
    op.create_index(
        "uq_model_connections_single_default",
        "model_connections",
        ["is_default"],
        unique=True,
        sqlite_where=sa.text("is_default = 1"),
    )
    op.create_index(
        "ix_model_connections_updated_at", "model_connections", ["updated_at"]
    )
    op.create_table(
        "model_catalog_entries",
        sa.Column(
            "connection_id",
            sa.String(64),
            sa.ForeignKey("model_connections.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("model_id", sa.String(256), primary_key=True),
        sa.Column("display_name", sa.String(256)),
        sa.Column("sources", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("availability", sa.String(32), nullable=False),
        sa.Column("text_check", sa.String(32), nullable=False),
        sa.Column("text_checked_at", sa.DateTime(timezone=True)),
        sa.Column("text_error_code", sa.String(100)),
        sa.Column("tool_check", sa.String(32), nullable=False),
        sa.Column("tool_checked_at", sa.DateTime(timezone=True)),
        sa.Column("tool_error_code", sa.String(100)),
        sa.Column("tool_capability", sa.String(32), nullable=False),
        sa.Column("tool_capability_source", sa.String(32), nullable=False),
        sa.Column("reasoning_efforts", sa.JSON(), nullable=False),
        sa.Column("reasoning_source", sa.String(32), nullable=False),
        sa.Column("discovered_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "revision > 0", name="ck_model_catalog_revision_positive"
        ),
        sa.CheckConstraint(
            "availability IN ('available', 'unavailable')",
            name="ck_model_catalog_availability",
        ),
        sa.CheckConstraint(
            "text_check IN ('unchecked', 'passed', 'failed')",
            name="ck_model_catalog_text_check",
        ),
        sa.CheckConstraint(
            "tool_check IN ('unchecked', 'passed', 'failed')",
            name="ck_model_catalog_tool_check",
        ),
        sa.CheckConstraint(
            "tool_capability IN ('unknown', 'supported', 'unsupported')",
            name="ck_model_catalog_tool_capability",
        ),
        sa.CheckConstraint(
            "tool_capability_source IN "
            "('unknown', 'provider_metadata', 'validation')",
            name="ck_model_catalog_tool_capability_source",
        ),
        sa.CheckConstraint(
            "reasoning_source IN ('unknown', 'provider_metadata')",
            name="ck_model_catalog_reasoning_source",
        ),
    )
    op.create_index(
        "ix_model_catalog_connection_revision",
        "model_catalog_entries",
        ["connection_id", "revision"],
    )
    op.create_table(
        "model_credentials",
        sa.Column(
            "connection_id",
            sa.String(64),
            sa.ForeignKey("model_connections.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("api_key", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("model_credentials")
    op.drop_index(
        "ix_model_catalog_connection_revision", table_name="model_catalog_entries"
    )
    op.drop_table("model_catalog_entries")
    op.drop_index("ix_model_connections_updated_at", table_name="model_connections")
    op.drop_index(
        "uq_model_connections_single_default", table_name="model_connections"
    )
    op.drop_table("model_connections")
    op.drop_index("ix_agent_events_session_sequence", table_name="agent_events")
    op.drop_table("agent_events")
    op.drop_index("ix_messages_session_sequence", table_name="messages")
    op.drop_table("messages")
    op.drop_table("session_archives")
    op.drop_index("ix_sessions_workspace_updated_at", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("workspace_removals")
    op.drop_index("ix_workspaces_updated_at", table_name="workspaces")
    op.drop_table("workspaces")
