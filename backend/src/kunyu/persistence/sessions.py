from sqlalchemy import and_, delete, or_, select, text
from sqlalchemy.dialects.sqlite import insert

from kunyu.domain.events import AgentEvent
from kunyu.domain.runs import NONTERMINAL_RUN_STATE_VALUES, UnfinishedRunConflictError
from kunyu.domain.sessions import (
    ArchivedSessionPage,
    ArchivedWorkspace,
    InvalidArchiveCursorError,
    Session,
    SessionNotArchivedError,
)
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    AgentEventRecord,
    RunRecord,
    SessionArchiveRecord,
    SessionRecord,
    WorkspaceRecord,
    WorkspaceRemovalRecord,
)
from kunyu.persistence.time import as_utc


class SQLAlchemySessionRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def set_archived(self, session_id: str, archived: bool) -> bool:
        with self._database.sessions.begin() as session:
            session.execute(text("BEGIN IMMEDIATE"))
            record = session.get(SessionRecord, session_id)
            if record is None:
                return False
            if archived:
                _require_no_unfinished_run(session, session_id=session_id)
                session.execute(
                    insert(SessionArchiveRecord)
                    .values(session_id=session_id)
                    .on_conflict_do_nothing()
                )
            else:
                session.execute(
                    delete(WorkspaceRemovalRecord).where(
                        WorkspaceRemovalRecord.workspace_id == record.workspace_id
                    )
                )
                session.execute(
                    delete(SessionArchiveRecord).where(
                        SessionArchiveRecord.session_id == session_id
                    )
                )
            return True

    def list_archived_groups(self, limit: int) -> list[ArchivedWorkspace]:
        with self._database.sessions() as session:
            workspaces = session.scalars(
                select(WorkspaceRecord)
                .where(
                    select(SessionRecord.id)
                    .where(
                        SessionRecord.workspace_id == WorkspaceRecord.id,
                        SessionRecord.archive.has(),
                    )
                    .exists()
                )
                .order_by(WorkspaceRecord.updated_at.desc(), WorkspaceRecord.id.desc())
            ).all()
            return [
                ArchivedWorkspace(
                    record.id, record.name, self.archived_page(record.id, None, limit)
                )
                for record in workspaces
            ]

    def archived_page(
        self, workspace_id: str, cursor: str | None, limit: int
    ) -> ArchivedSessionPage:
        with self._database.sessions() as session:
            statement = select(SessionRecord).where(
                SessionRecord.workspace_id == workspace_id, SessionRecord.archive.has()
            )
            if cursor is not None:
                last = session.get(SessionRecord, cursor)
                if (
                    last is None
                    or last.workspace_id != workspace_id
                    or last.archive is None
                ):
                    raise InvalidArchiveCursorError(
                        "Archive cursor is no longer valid."
                    )
                statement = statement.where(
                    or_(
                        SessionRecord.updated_at < last.updated_at,
                        and_(
                            SessionRecord.updated_at == last.updated_at,
                            SessionRecord.id < last.id,
                        ),
                    )
                )
            records = session.scalars(
                statement.order_by(
                    SessionRecord.updated_at.desc(), SessionRecord.id.desc()
                ).limit(limit + 1)
            ).all()
            has_more = len(records) > limit
            items = [_to_domain(record) for record in records[:limit]]
            return ArchivedSessionPage(
                items, has_more, items[-1].id if has_more else None
            )

    def delete_archived(self, session_id: str) -> bool:
        with self._database.sessions.begin() as session:
            session.execute(text("BEGIN IMMEDIATE"))
            record = session.get(SessionRecord, session_id)
            if record is None:
                return False
            if record.archive is None:
                raise SessionNotArchivedError(
                    "Only archived sessions can be permanently deleted."
                )
            _require_no_unfinished_run(session, session_id=session_id)
            session.delete(record)
            return True

    def delete_archived_workspace(self, workspace_id: str) -> int:
        with self._database.sessions.begin() as session:
            session.execute(text("BEGIN IMMEDIATE"))
            _require_no_unfinished_run(session, workspace_id=workspace_id)
            result = session.execute(
                delete(SessionRecord).where(
                    SessionRecord.workspace_id == workspace_id,
                    SessionRecord.archive.has(),
                )
            )
            return result.rowcount

    def add(self, session: Session, created_event: AgentEvent) -> Session | None:
        with self._database.sessions.begin() as database_session:
            database_session.execute(text("BEGIN IMMEDIATE"))
            workspace_record = database_session.get(
                WorkspaceRecord, session.workspace_id
            )
            if (
                workspace_record is None
                or database_session.get(WorkspaceRemovalRecord, session.workspace_id)
                is not None
            ):
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
                run_id=created_event.run_id,
            )
            workspace_record.updated_at = session.updated_at
            database_session.add(session_record)
            database_session.flush()
            database_session.add(event_record)

            database_session.flush()
            result = _to_domain(session_record)

        return result

    def get(self, session_id: str) -> Session | None:
        with self._database.sessions() as database_session:
            record = database_session.get(SessionRecord, session_id)
            return _to_domain(record) if record is not None else None

    def list_for_workspace(self, workspace_id: str) -> list[Session] | None:
        statement = (
            select(SessionRecord)
            .where(
                SessionRecord.workspace_id == workspace_id, ~SessionRecord.archive.has()
            )
            .order_by(SessionRecord.updated_at.desc(), SessionRecord.id.desc())
        )
        with self._database.sessions() as database_session:
            if database_session.get(WorkspaceRecord, workspace_id) is None:
                return None
            records = database_session.scalars(statement).all()
            return [_to_domain(record) for record in records]


def _require_no_unfinished_run(
    session,
    *,
    session_id: str | None = None,
    workspace_id: str | None = None,
) -> None:
    statement = select(RunRecord.id).where(
        RunRecord.state.in_(NONTERMINAL_RUN_STATE_VALUES)
    )
    if session_id is not None:
        statement = statement.where(RunRecord.session_id == session_id)
    elif workspace_id is not None:
        statement = (
            statement.join(SessionRecord, SessionRecord.id == RunRecord.session_id)
            .join(
                SessionArchiveRecord,
                SessionArchiveRecord.session_id == RunRecord.session_id,
            )
            .where(SessionRecord.workspace_id == workspace_id)
        )
    else:
        raise ValueError("A session or workspace scope is required.")
    if session.scalar(statement.limit(1)) is not None:
        raise UnfinishedRunConflictError(
            "Cancel the unfinished run before changing this session."
        )


def _to_domain(record: SessionRecord) -> Session:
    return Session(
        id=record.id,
        workspace_id=record.workspace_id,
        title=record.title,
        archived=record.archive is not None,
        created_at=as_utc(record.created_at),
        updated_at=as_utc(record.updated_at),
    )
