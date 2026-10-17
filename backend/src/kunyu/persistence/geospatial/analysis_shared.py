"""Scope checks and transactional publications shared by analysis and maps."""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from kunyu.agent.runtime.events.session import (
    BusinessObjectChangedEvent,
    BusinessObjectPayload,
)
from kunyu.agent.runtime.events.store import EventBatch
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.persistence.database import Database
from kunyu.persistence.execution.agent_projections import (
    SQLAlchemyAgentProjectionService,
)
from kunyu.persistence.records.conversation import SessionArchiveRecord, SessionRecord
from kunyu.persistence.records.workspaces import WorkspaceRecord, WorkspaceRemovalRecord


def require_workspace(tx: Session, workspace_id: str) -> None:
    if (
        tx.get(WorkspaceRecord, workspace_id) is None
        or tx.get(WorkspaceRemovalRecord, workspace_id) is not None
    ):
        raise AnalysisError("NOT_FOUND", "Workspace was not found.", 404)


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
