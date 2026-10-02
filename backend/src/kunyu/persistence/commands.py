"""Read session controls from authoritative events; export the same log."""

from dataclasses import replace

from sqlalchemy import select

from kunyu.agent.runtime.events import (
    HistoryCompactedPayload,
    PermissionChangedPayload,
    PlanChangedPayload,
)
from kunyu.domain.commands import SessionControls
from kunyu.persistence.database import Database
from kunyu.persistence.models import SessionEventRecord


def read_session_controls(database: Database, session_id: str) -> SessionControls:
    state = SessionControls()
    with database.sessions() as session:
        records = session.scalars(
            select(SessionEventRecord)
            .where(
                SessionEventRecord.session_id == session_id,
                SessionEventRecord.event_type.in_(
                    ("plan/changed", "permission/changed", "history/compacted")
                ),
            )
            .order_by(SessionEventRecord.sequence)
        ).all()
        for record in records:
            if record.event_type == "plan/changed":
                state = replace(
                    state,
                    plan_active=PlanChangedPayload.model_validate(
                        record.payload
                    ).active,
                )
            elif record.event_type == "permission/changed":
                state = replace(
                    state,
                    permission=PermissionChangedPayload.model_validate(
                        record.payload
                    ).preset,
                )
            elif record.event_type == "history/compacted":
                payload = HistoryCompactedPayload.model_validate(record.payload)
                state = replace(
                    state,
                    summary=payload.summary,
                    compacted_through=payload.through_sequence,
                )
    return state
