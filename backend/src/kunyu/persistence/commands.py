"""Read session controls using the authoritative runtime projection."""

from sqlalchemy import case, select
from sqlalchemy.orm import Session

from kunyu.agent.runtime.control_projection import CONTROL_BOUNDARIES, ControlProjection
from kunyu.agent.runtime.events import validate_event_draft
from kunyu.domain.commands import SessionControls
from kunyu.persistence.database import Database
from kunyu.persistence.models import SessionEventRecord


def session_controls(transaction: Session, session_id: str) -> SessionControls:
    records = transaction.execute(
        select(
            SessionEventRecord.event_type,
            SessionEventRecord.run_id,
            SessionEventRecord.occurred_at,
            case(
                (SessionEventRecord.event_type.in_(CONTROL_BOUNDARIES), None),
                else_=SessionEventRecord.payload,
            ).label("payload"),
        )
        .where(
            SessionEventRecord.session_id == session_id,
            SessionEventRecord.event_type.in_(
                (
                    "plan/changed",
                    "plan/selected",
                    "permission/changed",
                    "history/compacted",
                    "agent/step/decision",
                    "request.header",
                    "run.created",
                    "run.completed",
                    "run.failed",
                    "run.cancelled",
                )
            ),
        )
        .order_by(SessionEventRecord.sequence)
    ).all()
    projection = ControlProjection()
    for record in records:
        if record.event_type in CONTROL_BOUNDARIES:
            projection.accept_boundary(record.event_type, record.run_id)
            continue
        projection.accept(
            validate_event_draft(
                {
                    "session_id": session_id,
                    "run_id": record.run_id,
                    "event_type": record.event_type,
                    "payload": record.payload,
                    "occurred_at": record.occurred_at,
                }
            )
        )
    return projection.state


def read_session_controls(database: Database, session_id: str) -> SessionControls:
    with database.sessions() as transaction:
        return session_controls(transaction, session_id)
