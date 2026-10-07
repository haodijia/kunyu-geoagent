"""Freeze original reasoning parameters and add separate user declarations."""

import json

import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def _legacy_parameters(snapshot: dict) -> dict:
    protocol, provider, effort = (
        snapshot["protocol"],
        snapshot["provider_type"],
        snapshot["reasoning_effort"],
    )
    if protocol == "deepseek_messages":
        if effort == "off":
            return {"thinking": {"type": "disabled"}}
        return {
            "thinking": {"type": "enabled"},
            "output_config": {"effort": effort if effort is not None else "high"},
        }
    if effort is None:
        return {}
    if protocol == "openai_responses":
        return {"reasoning": {"effort": effort}}
    if provider == "deepseek":
        if effort == "off":
            return {"thinking": {"type": "disabled"}}
        return {"thinking": {"type": "enabled"}, "reasoning_effort": effort}
    return {"reasoning_effort": effort}


def _upgrade_snapshots(value: object) -> bool:
    changed = False
    if isinstance(value, dict):
        if {
            "connection_id",
            "protocol",
            "provider_type",
            "reasoning_effort",
            "connection_revision",
            "max_output_tokens",
            "retry_policy",
        } <= value.keys():
            value["reasoning_parameters"] = _legacy_parameters(value)
            changed = True
        for child in value.values():
            changed = _upgrade_snapshots(child) or changed
    elif isinstance(value, list):
        for child in value:
            changed = _upgrade_snapshots(child) or changed
    return changed


def upgrade() -> None:
    op.add_column(
        "model_catalog_entries",
        sa.Column("reasoning_settings", sa.JSON(), nullable=True),
    )
    op.add_column(
        "run_model_snapshots",
        sa.Column(
            "reasoning_parameters",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )
    connection = op.get_bind()
    rows = (
        connection.execute(
            sa.text(
                "SELECT run_id, protocol, provider_type, reasoning_effort FROM run_model_snapshots"
            )
        )
        .mappings()
        .all()
    )
    for row in rows:
        connection.execute(
            sa.text(
                "UPDATE run_model_snapshots SET reasoning_parameters=:parameters WHERE run_id=:run_id"
            ),
            {
                "run_id": row["run_id"],
                "parameters": json.dumps(_legacy_parameters(dict(row))),
            },
        )
    events = (
        connection.execute(
            sa.text("SELECT session_id, sequence, payload FROM session_events")
        )
        .mappings()
        .all()
    )
    for event in events:
        payload = json.loads(event["payload"])
        if _upgrade_snapshots(payload):
            connection.execute(
                sa.text(
                    "UPDATE session_events SET payload=:payload WHERE session_id=:session_id AND sequence=:sequence"
                ),
                {
                    "payload": json.dumps(payload, ensure_ascii=False, allow_nan=False),
                    "session_id": event["session_id"],
                    "sequence": event["sequence"],
                },
            )


def downgrade() -> None:
    raise RuntimeError("Frozen thinking declarations cannot be downgraded.")
