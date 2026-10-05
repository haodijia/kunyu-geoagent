"""Allow native Responses connections and durable execution snapshots."""

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table, constraint in (
        ("model_connections", "ck_model_connections_protocol"),
        ("run_model_snapshots", "ck_run_snapshots_protocol"),
    ):
        with op.batch_alter_table(table, recreate="always") as batch:
            batch.drop_constraint(constraint, type_="check")
            batch.create_check_constraint(
                constraint,
                "protocol IN ('openai_compatible', 'deepseek_messages', 'openai_responses')",
            )


def downgrade() -> None:
    raise RuntimeError("Responses execution histories cannot be downgraded.")
