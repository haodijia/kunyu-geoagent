from dataclasses import dataclass
from typing import Literal

from sqlalchemy import func, select

from kunyu.agent.runtime.events import RunState
from kunyu.agent.runtime.run_state import ReducedRun
from kunyu.agent.runtime.session_reducer import reduce_session
from kunyu.domain.runs import (
    NONTERMINAL_RUN_STATE_VALUES,
    RunDetails,
)
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    MessageRecord,
    RunModelSnapshotRecord,
    RunRecord,
    SessionEventRecord,
    SessionRecord,
)
from kunyu.persistence.run_records import event_to_domain
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
            count = int(database_session.scalar(statement) or 0)
        return count + self.pending_turn_count()

    def list_pending_turn_sessions(self, limit: int | None = None) -> tuple[str, ...]:
        if limit == 0:
            return ()
        active_session = (
            select(RunRecord.id)
            .where(
                RunRecord.session_id == MessageRecord.session_id,
                RunRecord.state.in_(NONTERMINAL_RUN_STATE_VALUES),
            )
            .exists()
        )
        statement = (
            select(MessageRecord.session_id)
            .where(
                MessageRecord.role == "user",
                MessageRecord.run_id.is_(None),
                MessageRecord.status == "completed",
                ~active_session,
            )
            .group_by(MessageRecord.session_id)
            .order_by(func.min(MessageRecord.created_at), MessageRecord.session_id)
        )
        with self._database.sessions() as database_session:
            candidates = tuple(database_session.scalars(statement).all())
            ready = []
            for session_id in candidates:
                state = reduce_session(
                    event_to_domain(record)
                    for record in database_session.scalars(
                        select(SessionEventRecord)
                        .where(SessionEventRecord.session_id == session_id)
                        .order_by(SessionEventRecord.sequence)
                    )
                )
                if state.queue_mode == "auto" or state.dispatch_message_id is not None:
                    ready.append(session_id)
                if limit is not None and len(ready) >= limit:
                    break
        return tuple(ready)

    def pending_turn_count(self) -> int:
        with self._database.sessions() as database_session:
            return int(
                database_session.scalar(
                    select(func.count())
                    .select_from(MessageRecord)
                    .where(
                        MessageRecord.role == "user",
                        MessageRecord.run_id.is_(None),
                        MessageRecord.status == "completed",
                    )
                )
                or 0
            )

    def next_queue_sequence(self) -> int:
        with self._database.sessions() as database_session:
            current = int(
                database_session.scalar(select(func.max(RunRecord.queue_sequence))) or 0
            )
            payloads = database_session.scalars(
                select(SessionEventRecord.payload).where(
                    SessionEventRecord.event_type == "agent/inbox/spliced",
                )
            ).all()
        sequences = [
            item["turn"]["queue_sequence"]
            for payload in payloads
            if payload["target"] == "next-turn"
            for item in payload["messages"]
        ]
        return max([current, *sequences]) + 1

    def connection_has_unfinished_run(self, connection_id: str) -> bool:
        statement = (
            select(RunRecord.id)
            .join(
                MessageRecord,
                RunModelSnapshotRecord,
                RunModelSnapshotRecord.run_id == RunRecord.id,
            )
            .where(
                RunRecord.state.in_(NONTERMINAL_RUN_STATE_VALUES),
                RunModelSnapshotRecord.connection_id == connection_id,
            )
        )
        with self._database.sessions() as database_session:
            if database_session.scalar(statement.limit(1)) is not None:
                return True
            session_ids = database_session.scalars(
                select(MessageRecord.session_id)
                .where(
                    MessageRecord.role == "user",
                    MessageRecord.run_id.is_(None),
                    MessageRecord.status == "completed",
                )
                .distinct()
            ).all()
            for session_id in session_ids:
                events = database_session.scalars(
                    select(SessionEventRecord)
                    .where(
                        SessionEventRecord.session_id == session_id,
                    )
                    .order_by(SessionEventRecord.sequence)
                ).all()
                state = reduce_session(event_to_domain(event) for event in events)
                if any(
                    item.turn is not None
                    and item.turn.model_snapshot.connection_id == connection_id
                    for item in state.next_turn
                ):
                    return True
            return False

    def open_budget_reservation(self, run_id: str) -> OpenBudgetReservation | None:
        statement = (
            select(SessionEventRecord.event_type, SessionEventRecord.payload)
            .where(
                SessionEventRecord.run_id == run_id,
                SessionEventRecord.event_type.in_(
                    ("run.budget_reserved", "run.budget_settled")
                ),
            )
            .order_by(SessionEventRecord.sequence)
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
