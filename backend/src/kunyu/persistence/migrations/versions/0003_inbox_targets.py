"""Make durable inbox routing explicit for the two input queues."""

from alembic import op
from sqlalchemy import inspect, text

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    constraint = next(
        item
        for item in inspect(op.get_bind()).get_check_constraints("messages")
        if item["name"] == "ck_messages_role_shape"
    )
    if "status = 'completed'" in constraint["sqltext"]:
        with op.batch_alter_table("messages") as batch:
            batch.drop_constraint("ck_messages_role_shape", type_="check")
            batch.create_check_constraint(
                "ck_messages_role_shape",
                "(role = 'user' AND step IS NULL AND attempt IS NULL AND status IN ('completed', 'cancelled')) OR (role = 'assistant' AND run_id IS NOT NULL AND step > 0 AND attempt > 0)",
            )
    op.execute("""
        UPDATE session_events
        SET payload = json_set(payload, '$.target', 'next-step')
        WHERE event_type = 'agent/inbox/spliced'
          AND json_type(payload, '$.target') IS NULL
    """)


def downgrade() -> None:
    incompatible = op.get_bind().scalar(
        text("""
        SELECT COUNT(*) FROM session_events
        WHERE event_type = 'agent/inbox/spliced'
          AND json_extract(payload, '$.target') = 'next-turn'
    """)
    )
    if incompatible:
        raise RuntimeError(
            "Cannot downgrade a session history containing next-turn input."
        )
    with op.batch_alter_table("messages") as batch:
        batch.drop_constraint("ck_messages_role_shape", type_="check")
        batch.create_check_constraint(
            "ck_messages_role_shape",
            "(role = 'user' AND step IS NULL AND attempt IS NULL AND status = 'completed') OR (role = 'assistant' AND run_id IS NOT NULL AND step > 0 AND attempt > 0)",
        )
    op.execute("""
        UPDATE session_events
        SET payload = json_remove(payload, '$.target')
        WHERE event_type = 'agent/inbox/spliced'
          AND json_extract(payload, '$.target') = 'next-step'
    """)
