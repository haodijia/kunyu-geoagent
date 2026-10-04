"""Admit durable human-input waits in the run state projection."""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("runs", recreate="always") as batch:
        batch.drop_constraint("ck_runs_state", type_="check")
        batch.create_check_constraint(
            "ck_runs_state",
            "state IN ('ready', 'model_running', 'tool_running', 'waiting_confirmation', 'waiting_input', 'interrupted', 'completed', 'failed', 'cancelled')",
        )
        batch.drop_index("uq_runs_session_active")
        batch.create_index(
            "uq_runs_session_active",
            ["session_id"],
            unique=True,
            sqlite_where=sa.text(
                "state IN ('ready', 'model_running', 'tool_running', 'waiting_confirmation', 'waiting_input', 'interrupted')"
            ),
        )


def downgrade() -> None:
    raise RuntimeError("Human-question histories cannot be downgraded.")
