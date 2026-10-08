"""Declare model windows while preserving unknown historical capacities."""

import json

import sqlalchemy as sa
from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def _snapshots(value: object) -> bool:
    changed = False
    if isinstance(value, dict):
        if {
            "connection_revision",
            "model_id",
            "retry_policy",
            "max_output_tokens",
            "reasoning_parameters",
        } <= value.keys():
            value["context_window"] = None
            value["retention_tokens"] = 0
            changed = True
        for child in value.values():
            changed = _snapshots(child) or changed
    elif isinstance(value, list):
        for child in value:
            changed = _snapshots(child) or changed
    return changed


def upgrade() -> None:
    for table, default in (
        ("model_catalog_entries", "2048"),
        ("run_model_snapshots", "0"),
    ):
        op.add_column(table, sa.Column("context_window", sa.Integer(), nullable=True))
        op.add_column(
            table,
            sa.Column(
                "retention_tokens", sa.Integer(), nullable=False, server_default=default
            ),
        )
    connection = op.get_bind()
    records = (
        connection.execute(
            sa.text("SELECT session_id, sequence, payload FROM session_events")
        )
        .mappings()
        .all()
    )
    for record in records:
        payload = json.loads(record["payload"])
        if _snapshots(payload):
            connection.execute(
                sa.text(
                    "UPDATE session_events SET payload=:payload WHERE session_id=:sid AND sequence=:seq"
                ),
                {
                    "payload": json.dumps(payload, ensure_ascii=False, allow_nan=False),
                    "sid": record["session_id"],
                    "seq": record["sequence"],
                },
            )


def downgrade() -> None:
    raise RuntimeError("Declared context windows cannot be downgraded.")
