from sqlalchemy import select

from kunyu.domain.events import AgentEvent
from kunyu.domain.sessions import Session
from kunyu.persistence.database import Database
from kunyu.persistence.models import AgentEventRecord, SessionRecord, WorkspaceRecord
from kunyu.persistence.time import as_utc


class SQLAlchemySessionRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def add(self, session: Session, created_event: AgentEvent) -> Session | None:
        with self._database.sessions.begin() as database_session:
            workspace_record = database_session.get(
                WorkspaceRecord, session.workspace_id
            )
            if workspace_record is None:
                return None

            session_record = SessionRecord(
                id=session.id,
                workspace_id=session.workspace_id,
                title=session.title,
                created_at=session.created_at,
                updated_at=session.updated_at,
            )
            event_record = AgentEventRecord(
                id=created_event.id,
                session_id=created_event.session_id,
                sequence=created_event.sequence,
                event_type=created_event.event_type,
                payload=created_event.payload,
                occurred_at=created_event.occurred_at,
            )
            workspace_record.updated_at = session.updated_at
            database_session.add(session_record)
            database_session.flush()
            database_session.add(event_record)

        return _to_domain(session_record)

    def get(self, session_id: str) -> Session | None:
        with self._database.sessions() as database_session:
            record = database_session.get(SessionRecord, session_id)
            return _to_domain(record) if record is not None else None

    def list_for_workspace(self, workspace_id: str) -> list[Session] | None:
        statement = (
            select(SessionRecord)
            .where(SessionRecord.workspace_id == workspace_id)
            .order_by(SessionRecord.updated_at.desc(), SessionRecord.id.desc())
        )
        with self._database.sessions() as database_session:
            if database_session.get(WorkspaceRecord, workspace_id) is None:
                return None
            records = database_session.scalars(statement).all()
            return [_to_domain(record) for record in records]


def _to_domain(record: SessionRecord) -> Session:
    return Session(
        id=record.id,
        workspace_id=record.workspace_id,
        title=record.title,
        created_at=as_utc(record.created_at),
        updated_at=as_utc(record.updated_at),
    )
