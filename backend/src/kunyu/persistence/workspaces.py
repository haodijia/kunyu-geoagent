from sqlalchemy import select, text
from sqlalchemy.dialects.sqlite import insert

from kunyu.domain.workspaces import Workspace
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    SessionArchiveRecord,
    SessionRecord,
    WorkspaceRecord,
    WorkspaceRemovalRecord,
)
from kunyu.persistence.time import as_utc


class SQLAlchemyWorkspaceRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def remove(self, workspace_id: str) -> bool:
        with self._database.sessions.begin() as session:
            session.execute(text("BEGIN IMMEDIATE"))
            if session.get(WorkspaceRecord, workspace_id) is None:
                return False
            session.execute(
                insert(SessionArchiveRecord)
                .from_select(
                    ["session_id"],
                    select(SessionRecord.id).where(
                        SessionRecord.workspace_id == workspace_id
                    ),
                )
                .on_conflict_do_nothing()
            )
            session.execute(
                insert(WorkspaceRemovalRecord)
                .values(workspace_id=workspace_id)
                .on_conflict_do_nothing()
            )
            return True

    def add(self, workspace: Workspace) -> Workspace:
        record = WorkspaceRecord(
            id=workspace.id,
            name=workspace.name,
            created_at=workspace.created_at,
            updated_at=workspace.updated_at,
        )
        with self._database.sessions.begin() as session:
            session.add(record)
        return _to_domain(record)

    def get(self, workspace_id: str) -> Workspace | None:
        with self._database.sessions() as session:
            record = session.get(WorkspaceRecord, workspace_id)
            return _to_domain(record) if record is not None else None

    def list_recent(self) -> list[Workspace]:
        statement = (
            select(WorkspaceRecord)
            .where(~WorkspaceRecord.id.in_(select(WorkspaceRemovalRecord.workspace_id)))
            .order_by(WorkspaceRecord.updated_at.desc(), WorkspaceRecord.id.desc())
        )
        with self._database.sessions() as session:
            records = session.scalars(statement).all()
            return [_to_domain(record) for record in records]


def _to_domain(record: WorkspaceRecord) -> Workspace:
    return Workspace(
        id=record.id,
        name=record.name,
        created_at=as_utc(record.created_at),
        updated_at=as_utc(record.updated_at),
    )
