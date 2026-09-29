from dataclasses import dataclass
from typing import Literal

from sqlalchemy import func, select

from dsh.events import RunState
from dsh.run_state import ReducedRun
from kunyu.domain.runs import (
    NONTERMINAL_RUN_STATE_VALUES,
    RunDetails,
)
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    AgentEventRecord,
    RunModelSnapshotRecord,
    RunRecord,
    SessionRecord,
)
from kunyu.persistence.runs import SQLAlchemyEventStore


@dataclass(frozen=True, slots=True)
class OpenBudgetReservation:
    operation_id: str
    operation_type: Literal["model", "tool"]
    operation_count: int
    reserved_milliseconds: int


class SQLAlchemyRunLifecycleRepository:
    def __init__(self, database: Database) -> None:
        self._database = database
        self._events = SQLAlchemyEventStore(database)

    def get_reduced(self, run_id: str) -> ReducedRun | None:
        return self._events.get_reduced_run(run_id)

    def get_details(self, run_id: str) -> RunDetails | None:
        run = self._events.get_run(run_id)
        snapshot = self._events.get_snapshot(run_id)
        if run is None or snapshot is None:
            return None
        return RunDetails(run, snapshot, self._events.list_tool_calls(run_id))

    def list_details_for_session(
        self, session_id: str
    ) -> tuple[RunDetails, ...] | None:
        statement = (
            select(RunRecord.id)
            .where(RunRecord.session_id == session_id)
            .order_by(RunRecord.created_at, RunRecord.id)
        )
        with self._database.sessions() as database_session:
            if database_session.get(SessionRecord, session_id) is None:
                return None
            run_ids = tuple(database_session.scalars(statement).all())
        details = tuple(self.get_details(run_id) for run_id in run_ids)
        if any(item is None for item in details):
            raise RuntimeError("Run query projections are incomplete.")
        return tuple(item for item in details if item is not None)

    def list_startup_candidates(self) -> tuple[ReducedRun, ...]:
        statement = (
            select(RunRecord.id)
            .where(RunRecord.state.in_(NONTERMINAL_RUN_STATE_VALUES))
            .order_by(RunRecord.created_at, RunRecord.id)
        )
        with self._database.sessions() as database_session:
            run_ids = tuple(database_session.scalars(statement).all())
        runs = tuple(self._events.get_reduced_run(run_id) for run_id in run_ids)
        return tuple(run for run in runs if run is not None)

    def list_queued_run_ids(
        self, limit: int, excluded: frozenset[str]
    ) -> tuple[str, ...]:
        statement = (
            select(RunRecord.id)
            .where(
                RunRecord.state == RunState.READY.value,
                RunRecord.requires_resume.is_(False),
                RunRecord.queue_sequence.is_not(None),
            )
            .order_by(RunRecord.queue_sequence, RunRecord.created_at, RunRecord.id)
        )
        if excluded:
            statement = statement.where(~RunRecord.id.in_(excluded))
        with self._database.sessions() as database_session:
            return tuple(database_session.scalars(statement.limit(limit)).all())

    def queued_count(self) -> int:
        statement = (
            select(func.count())
            .select_from(RunRecord)
            .where(
                RunRecord.state == RunState.READY.value,
                RunRecord.requires_resume.is_(False),
                RunRecord.queue_sequence.is_not(None),
            )
        )
        with self._database.sessions() as database_session:
            return int(database_session.scalar(statement) or 0)

    def next_queue_sequence(self) -> int:
        with self._database.sessions() as database_session:
            current = database_session.scalar(
                select(func.max(RunRecord.queue_sequence))
            )
        return int(current or 0) + 1

    def connection_has_unfinished_run(self, connection_id: str) -> bool:
        statement = (
            select(RunRecord.id)
            .join(
                RunModelSnapshotRecord,
                RunModelSnapshotRecord.run_id == RunRecord.id,
            )
            .where(
                RunRecord.state.in_(NONTERMINAL_RUN_STATE_VALUES),
                RunModelSnapshotRecord.connection_id == connection_id,
            )
        )
        with self._database.sessions() as database_session:
            return database_session.scalar(statement.limit(1)) is not None

    def open_budget_reservation(self, run_id: str) -> OpenBudgetReservation | None:
        statement = (
            select(AgentEventRecord.event_type, AgentEventRecord.payload)
            .where(
                AgentEventRecord.run_id == run_id,
                AgentEventRecord.event_type.in_(
                    ("run.budget_reserved", "run.budget_settled")
                ),
            )
            .order_by(AgentEventRecord.sequence)
        )
        reservations: dict[str, OpenBudgetReservation] = {}
        with self._database.sessions() as database_session:
            rows = database_session.execute(statement).all()
        for event_type, payload in rows:
            operation_id = payload["operation_id"]
            if event_type == "run.budget_reserved":
                reservations[operation_id] = OpenBudgetReservation(
                    operation_id=operation_id,
                    operation_type=payload["operation_type"],
                    operation_count=payload["operation_count"],
                    reserved_milliseconds=payload["reserved_milliseconds"],
                )
            else:
                reservations.pop(operation_id, None)
        if len(reservations) > 1:
            raise RuntimeError(f"Run '{run_id}' has multiple open budget reservations.")
        return next(iter(reservations.values()), None)
