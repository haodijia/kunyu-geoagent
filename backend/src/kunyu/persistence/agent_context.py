from dsh.session_reducer import reduce_session
from sqlalchemy import select

from kunyu.domain.agent_context import RunContextSource
from kunyu.domain.sessions import Session
from kunyu.domain.workspaces import Workspace
from kunyu.persistence import run_records
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    AgentEventRecord,
    SessionRecord,
    WorkspaceRecord,
)
from kunyu.persistence.time import as_utc
from kunyu.persistence.workspace_memory import list_recent_workspace_memories


class SQLAlchemyRunContextRepository:
    def __init__(self, database: Database) -> None:
        self._database = database

    def get(self, run_id: str, memory_limit: int) -> RunContextSource | None:
        if memory_limit <= 0:
            raise ValueError("Context memory limit must be positive.")
        with self._database.sessions() as database_session:
            session_id = database_session.scalar(
                select(AgentEventRecord.session_id)
                .where(AgentEventRecord.run_id == run_id)
                .order_by(AgentEventRecord.sequence)
                .limit(1)
            )
            if session_id is None:
                return None
            session_record = database_session.get(SessionRecord, session_id)
            if session_record is None:
                return None
            workspace_record = database_session.get(
                WorkspaceRecord, session_record.workspace_id
            )
            if workspace_record is None:
                return None

            event_records = database_session.scalars(
                select(AgentEventRecord)
                .where(AgentEventRecord.session_id == session_id)
                .order_by(AgentEventRecord.sequence)
            ).all()
            reduced_session = reduce_session(
                run_records.event_to_domain(record) for record in event_records
            )
            last_request_sequence = max(
                (
                    record.sequence
                    for record in event_records
                    if record.event_type == "request.header"
                ),
                default=0,
            )
            injected_context = tuple(
                str(record.payload["content"])
                for record in event_records
                if record.event_type == "context.injected"
                and record.sequence > last_request_sequence
            )
            run = next(
                (item for item in reduced_session.runs if item.run_id == run_id),
                None,
            )
            if run is None:
                return None
            memories = list_recent_workspace_memories(
                database_session, workspace_record.id, memory_limit
            )
            return RunContextSource(
                workspace=Workspace(
                    id=workspace_record.id,
                    name=workspace_record.name,
                    created_at=as_utc(workspace_record.created_at),
                    updated_at=as_utc(workspace_record.updated_at),
                ),
                session=Session(
                    id=session_record.id,
                    workspace_id=session_record.workspace_id,
                    title=session_record.title,
                    archived=session_record.archive is not None,
                    created_at=as_utc(session_record.created_at),
                    updated_at=as_utc(session_record.updated_at),
                ),
                run=run,
                reduced_session=reduced_session,
                memories=memories,
                injected_context=injected_context,
            )
