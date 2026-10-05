"""Admit Xiaomi MiMo connections without rewriting existing provider facts."""

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("model_connections", recreate="always") as batch:
        batch.drop_constraint("ck_model_connections_provider_type", type_="check")
        batch.create_check_constraint(
            "ck_model_connections_provider_type",
            "provider_type IN ('openai', 'deepseek', 'moonshot', 'mimo', 'zai', "
            "'siliconflow', 'openrouter', 'groq', 'nvidia', 'together', "
            "'deepinfra', 'fireworks', 'alibaba', 'xai', 'mistral', 'ollama', "
            "'lm_studio', 'localai', 'custom')",
        )


def downgrade() -> None:
    raise RuntimeError("MiMo connection histories cannot be downgraded.")
