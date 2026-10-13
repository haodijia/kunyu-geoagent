"""Scope checks and transactional publications shared by analysis and maps."""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from kunyu.agent.runtime.events import (
    BusinessObjectChangedEvent,
    BusinessObjectPayload,
    EventBatch,
)
from kunyu.domain.analysis import AnalysisError
from kunyu.persistence.agent_projections import SQLAlchemyAgentProjectionService
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    SessionArchiveRecord,
    SessionRecord,
    WorkspaceRemovalRecord,
)


def require_session(
    tx: Session, session_id: str, *, writable: bool = False
) -> SessionRecord:
    session = tx.get(SessionRecord, session_id)
    if (
        session is None
        or tx.get(WorkspaceRemovalRecord, session.workspace_id) is not None
    ):
        raise AnalysisError("NOT_FOUND", "Session was not found.", 404)
    if writable and tx.get(SessionArchiveRecord, session_id) is not None:
        raise AnalysisError(
            "SESSION_ARCHIVED", "Archived sessions cannot change analysis or map state."
        )
    return session


def publish(
    database: Database,
    tx: Session,
    session_id: str,
    event_type: str,
    object_id: str,
    revision: int,
    state: str | None = None,
) -> None:
    event = BusinessObjectChangedEvent(
        session_id=session_id,
        event_type=event_type,
        payload=BusinessObjectPayload(
            object_id=object_id, revision=revision, state=state
        ),
        occurred_at=datetime.now(UTC),
    )
    SQLAlchemyAgentProjectionService(database).commit_in_transaction(
        tx, EventBatch(session_id, None, (event,))
    )
