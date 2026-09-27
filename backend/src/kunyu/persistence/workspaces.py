from sqlalchemy import exists, or_, select

from kunyu.domain.workspaces import Workspace
from kunyu.persistence.database import Database
from kunyu.persistence.models import SessionRecord, WorkspaceRecord
from kunyu.persistence.time import as_utc


class SQLAlchemyWorkspaceRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

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
        statement = select(WorkspaceRecord).order_by(
            WorkspaceRecord.updated_at.desc(), WorkspaceRecord.id.desc()
        )
        workspace_sessions = select(SessionRecord.id).where(
            SessionRecord.workspace_id == WorkspaceRecord.id
        )
        statement = statement.where(
            or_(
                ~exists(workspace_sessions),
                exists(workspace_sessions.where(~SessionRecord.archive.has())),
            )
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
