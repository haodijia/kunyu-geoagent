"""Persist the actual model route of each request attempt."""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE session_events AS request
        SET payload = json_set(request.payload, '$.model_snapshot', json((
            SELECT json_extract(created.payload, '$.model_snapshot')
            FROM session_events AS created
            WHERE created.run_id = request.run_id AND created.event_type = 'run.created'
        )))
        WHERE request.event_type = 'request.header'
    """)
    op.execute("""
        UPDATE session_events AS injection
        SET payload = json_set(injection.payload, '$.metadata.step', COALESCE((
            SELECT MIN(json_extract(header.payload, '$.step'))
            FROM session_events AS header
            WHERE header.run_id = json_extract(injection.payload, '$.metadata.run_id')
              AND header.event_type = 'request.header' AND header.sequence > injection.sequence
        ), 1))
        WHERE injection.event_type = 'context.injected'
          AND json_extract(injection.payload, '$.producer') = 'skill-invocation'
    """)


def downgrade() -> None:
    raise RuntimeError("Request configuration logs cannot be downgraded.")
