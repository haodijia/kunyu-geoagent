"""Allow explicit native Messages connections and durable execution snapshots."""

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table, constraint in (
        ("model_connections", "ck_model_connections_protocol"),
        ("run_model_snapshots", "ck_run_snapshots_protocol"),
    ):
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(constraint, type_="check")
            batch.create_check_constraint(
                constraint, "protocol IN ('openai_compatible', 'deepseek_messages')"
            )

    with op.batch_alter_table("model_catalog_entries") as batch:
        batch.drop_constraint("ck_model_catalog_reasoning_source", type_="check")
        batch.create_check_constraint(
            "ck_model_catalog_reasoning_source",
            "reasoning_source IN ('unknown', 'provider_metadata', 'protocol')",
        )


def downgrade() -> None:
    raise RuntimeError("Native Messages snapshots cannot be downgraded.")
