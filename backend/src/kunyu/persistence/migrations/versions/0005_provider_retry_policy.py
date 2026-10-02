"""Freeze provider-owned retry policies in connection settings and request logs."""

import json

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

_DEFAULT = {
    "mode": "normal",
    "max_retries": 5,
    "retryable_codes": [
        "MODEL_EMPTY_RESPONSE",
        "PROVIDER_RATE_LIMIT",
        "PROVIDER_SERVER",
        "PROVIDER_TIMEOUT",
        "PROVIDER_NETWORK",
    ],
    "initial_delay_ms": 500,
    "max_delay_ms": 10_000,
    "jitter_ratio": 0.1,
}


def upgrade() -> None:
    connection = op.get_bind()
    columns = {
        column["name"]
        for column in sa.inspect(connection).get_columns("model_connections")
    }
    if "retry_policy" not in columns:
        op.add_column(
            "model_connections",
            sa.Column(
                "retry_policy",
                sa.JSON(),
                nullable=False,
                server_default=json.dumps(_DEFAULT),
            ),
        )
    rows = connection.execute(
        sa.text(
            "SELECT id, payload FROM session_events WHERE event_type IN ('run.created', 'run.model_selected', 'request.header', 'agent/inbox/spliced')"
        )
    ).all()
    for identity, raw in rows:
        payload = json.loads(raw)
        _add_snapshot_policy(payload)
        connection.execute(
            sa.text(
                "UPDATE session_events SET payload = :payload WHERE id = :identity"
            ),
            {"payload": json.dumps(payload, ensure_ascii=False), "identity": identity},
        )


def _add_snapshot_policy(value: object) -> None:
    if isinstance(value, dict):
        for key, item in tuple(value.items()):
            if key == "model_snapshot":
                item["retry_policy"] = _DEFAULT
            else:
                _add_snapshot_policy(item)
    elif isinstance(value, list):
        for item in value:
            _add_snapshot_policy(item)


def downgrade() -> None:
    raise RuntimeError("Provider retry policy logs cannot be downgraded.")
