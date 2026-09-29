from sqlalchemy import select

from dsh.events import AgentEvent, EventBatch
from dsh.reducer import reduce_run
from dsh.run_state import ReducedRun
from kunyu.domain.runs import Run, RunModelSnapshot, ToolCall
from kunyu.persistence import run_records
from kunyu.persistence.agent_projections import SQLAlchemyAgentProjectionService
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    AgentEventRecord,
    RunModelSnapshotRecord,
    RunRecord,
    ToolCallRecord,
)


class SQLAlchemyEventStore:
    """Append facts and derive every Agent query projection atomically."""

    def __init__(self, database: Database) -> None:
        self._database = database
        self._projections = SQLAlchemyAgentProjectionService(database)

    async def commit(self, batch: EventBatch) -> tuple[AgentEvent, ...]:
        return self._projections.commit(batch)

    async def list_after(
        self, session_id: str, sequence: int
    ) -> tuple[AgentEvent, ...]:
        statement = (
            select(AgentEventRecord)
            .where(
                AgentEventRecord.session_id == session_id,
                AgentEventRecord.sequence > sequence,
            )
            .order_by(AgentEventRecord.sequence)
        )
        with self._database.sessions() as database_session:
            records = database_session.scalars(statement).all()
            return tuple(run_records.event_to_domain(record) for record in records)

    def get_run(self, run_id: str) -> Run | None:
        with self._database.sessions() as database_session:
            record = database_session.get(RunRecord, run_id)
            return run_records.run_to_domain(record) if record is not None else None

    def get_snapshot(self, run_id: str) -> RunModelSnapshot | None:
        with self._database.sessions() as database_session:
            record = database_session.get(RunModelSnapshotRecord, run_id)
            return (
                run_records.snapshot_to_domain(record) if record is not None else None
            )

    def get_reduced_run(self, run_id: str) -> ReducedRun | None:
        statement = (
            select(AgentEventRecord)
            .where(AgentEventRecord.run_id == run_id)
            .order_by(AgentEventRecord.sequence)
        )
        with self._database.sessions() as database_session:
            records = tuple(database_session.scalars(statement).all())
        if not records:
            return None
        return reduce_run(run_records.event_to_domain(record) for record in records)

    def list_tool_calls(self, run_id: str) -> tuple[ToolCall, ...]:
        statement = (
            select(ToolCallRecord)
            .where(ToolCallRecord.run_id == run_id)
            .order_by(
                ToolCallRecord.step,
                ToolCallRecord.attempt,
                ToolCallRecord.batch_index,
            )
        )
        with self._database.sessions() as database_session:
            return tuple(
                run_records.tool_call_to_domain(record)
                for record in database_session.scalars(statement).all()
            )
