from sqlalchemy import func, select
from sqlalchemy.orm import Session

from kunyu.domain.workspace_memory import (
    WorkspaceMemory,
    WorkspaceMemoryPage,
    WorkspaceMemoryWorkspaceNotFoundError,
)
from kunyu.persistence.database import Database
from kunyu.persistence.models import WorkspaceMemoryRecord, WorkspaceRecord
from kunyu.persistence.time import as_utc


class SQLAlchemyWorkspaceMemoryRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def list_recent(self, workspace_id: str, limit: int) -> WorkspaceMemoryPage:
        _require_positive_limit(limit)
        with self._database.sessions() as database_session:
            return list_recent_workspace_memories(database_session, workspace_id, limit)

    def search(self, workspace_id: str, query: str, limit: int) -> WorkspaceMemoryPage:
        _require_positive_limit(limit)
        if not query:
            raise ValueError("Memory search query must not be empty.")
        with self._database.sessions() as database_session:
            _require_workspace(database_session, workspace_id)
            predicate = func.instr(WorkspaceMemoryRecord.content, query) > 0
            total_count = database_session.scalar(
                select(func.count())
                .select_from(WorkspaceMemoryRecord)
                .where(
                    WorkspaceMemoryRecord.workspace_id == workspace_id,
                    predicate,
                )
            )
            records = database_session.scalars(
                select(WorkspaceMemoryRecord)
                .where(
                    WorkspaceMemoryRecord.workspace_id == workspace_id,
                    predicate,
                )
                .order_by(
                    WorkspaceMemoryRecord.created_at.desc(),
                    WorkspaceMemoryRecord.id.desc(),
                )
                .limit(limit)
            ).all()
            return WorkspaceMemoryPage(
                items=tuple(_to_domain(record) for record in records),
                total_count=total_count or 0,
            )


def add_workspace_memory(database_session: Session, memory: WorkspaceMemory) -> None:
    _require_workspace(database_session, memory.workspace_id)
    database_session.add(
        WorkspaceMemoryRecord(
            id=memory.id,
            workspace_id=memory.workspace_id,
            content=memory.content,
            source_tool_call_id=memory.source_tool_call_id,
            created_at=memory.created_at,
        )
    )
    database_session.flush()


def list_recent_workspace_memories(
    database_session: Session, workspace_id: str, limit: int
) -> WorkspaceMemoryPage:
    _require_positive_limit(limit)
    _require_workspace(database_session, workspace_id)
    total_count = database_session.scalar(
        select(func.count())
        .select_from(WorkspaceMemoryRecord)
        .where(WorkspaceMemoryRecord.workspace_id == workspace_id)
    )
    records = database_session.scalars(
        select(WorkspaceMemoryRecord)
        .where(WorkspaceMemoryRecord.workspace_id == workspace_id)
        .order_by(
            WorkspaceMemoryRecord.created_at.desc(),
            WorkspaceMemoryRecord.id.desc(),
        )
        .limit(limit)
    ).all()
    return WorkspaceMemoryPage(
        items=tuple(_to_domain(record) for record in records),
        total_count=total_count or 0,
    )


def _require_workspace(database_session: Session, workspace_id: str) -> None:
    if database_session.get(WorkspaceRecord, workspace_id) is None:
        raise WorkspaceMemoryWorkspaceNotFoundError(workspace_id)


def _require_positive_limit(limit: int) -> None:
    if limit <= 0:
        raise ValueError("Memory result limit must be positive.")


def _to_domain(record: WorkspaceMemoryRecord) -> WorkspaceMemory:
    return WorkspaceMemory(
        id=record.id,
        workspace_id=record.workspace_id,
        content=record.content,
        source_tool_call_id=record.source_tool_call_id,
        created_at=as_utc(record.created_at),
    )
