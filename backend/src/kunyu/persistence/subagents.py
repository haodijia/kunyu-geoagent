"""Atomic child admission and queries over delegation journal projections."""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select, text

from kunyu.agent.runtime.events import (
    BudgetLimitsPayload,
    EventBatch,
    InboxMessagePayload,
    InboxSplicedEvent,
    InboxSplicedPayload,
    PermissionChangedEvent,
    PermissionChangedPayload,
    QueuedTurnPayload,
    SessionCreatedEvent,
    SessionCreatedPayload,
    SubagentCreatedEvent,
    SubagentCreatedPayload,
    SubagentSettledEvent,
    SubagentSettledPayload,
)
from kunyu.agent.runtime.session_reducer import reduce_session
from kunyu.agent.runtime.subagents import MAX_CHILDREN_PER_RUN, ReducedSubagent
from kunyu.agent.runtime.tools import ToolCall, ToolExecutionError
from kunyu.domain.agent_context import RunContextSource
from kunyu.persistence.agent_projections import SQLAlchemyAgentProjectionService
from kunyu.persistence.database import Database
from kunyu.persistence.models import SessionEventRecord, SessionRecord, SubagentRecord
from kunyu.persistence.run_records import event_to_domain
from kunyu.persistence.time import as_utc


class SQLAlchemySubagentRepository:
    def __init__(
        self, database: Database, projections: SQLAlchemyAgentProjectionService
    ):
        self.database, self.projections = database, projections

    def get(self, child_id: str) -> tuple[str, ReducedSubagent] | None:
        with self.database.sessions() as transaction:
            row = transaction.get(SubagentRecord, child_id)
            return None if row is None else (row.parent_session_id, self._child(row))

    def list(
        self, parent_id: str | None = None
    ) -> tuple[tuple[str, ReducedSubagent], ...]:
        statement = select(SubagentRecord).order_by(
            SubagentRecord.created_at, SubagentRecord.child_session_id
        )
        if parent_id is not None:
            statement = statement.where(SubagentRecord.parent_session_id == parent_id)
        with self.database.sessions() as transaction:
            return tuple(
                (row.parent_session_id, self._child(row))
                for row in transaction.scalars(statement)
            )

    def for_run(self, run_id: str) -> tuple[str, ReducedSubagent] | None:
        with self.database.sessions() as transaction:
            row = transaction.scalar(
                select(SubagentRecord).where(SubagentRecord.child_run_id == run_id)
            )
            return None if row is None else (row.parent_session_id, self._child(row))

    def is_child(self, session_id: str) -> bool:
        with self.database.sessions() as transaction:
            return transaction.get(SubagentRecord, session_id) is not None

    def create(
        self, call: ToolCall, source: RunContextSource, queue_sequence: int
    ) -> str:
        if self.is_child(source.session.id):
            raise ToolExecutionError("Subagents cannot delegate beyond depth one.")
        if (
            sum(
                child.created.owner_run_id == call.run_id
                for _, child in self.list(source.session.id)
            )
            >= MAX_CHILDREN_PER_RUN
        ):
            raise ToolExecutionError(
                "The parent run has exhausted its delegation limit."
            )
        child_id, run_id, message_id = (
            f"ses_{uuid4().hex}",
            f"run_{uuid4().hex}",
            f"msg_{uuid4().hex}",
        )
        now = datetime.now(UTC)
        description, prompt = call.arguments["description"], call.arguments["prompt"]
        model = source.run.request_snapshot or source.run.model_snapshot
        budget = source.run.budget
        limits = BudgetLimitsPayload(
            model_calls=budget.max_model_calls,
            tool_calls=budget.max_tool_calls,
            active_milliseconds=budget.max_active_milliseconds,
            output_codepoints=budget.max_output_codepoints,
        )
        child_events = (
            SessionCreatedEvent(
                session_id=child_id,
                event_type="session.created",
                payload=SessionCreatedPayload(
                    workspace_id=source.workspace.id, title=description
                ),
                occurred_at=now,
            ),
            PermissionChangedEvent(
                session_id=child_id,
                event_type="permission/changed",
                payload=PermissionChangedPayload(preset="read-only"),
                occurred_at=now,
            ),
            InboxSplicedEvent(
                session_id=child_id,
                event_type="agent/inbox/spliced",
                payload=InboxSplicedPayload(
                    target="next-turn",
                    target_run_id=run_id,
                    start=0,
                    delete_count=0,
                    messages=[
                        InboxMessagePayload(
                            message_id=message_id,
                            content=prompt,
                            attachments=(),
                            map_context=dict(source.run.map_snapshot),
                            turn=QueuedTurnPayload(
                                run_id=run_id,
                                queue_sequence=queue_sequence,
                                model_snapshot=model,
                                budget_limits=limits,
                            ),
                        )
                    ],
                ),
                occurred_at=now,
            ),
        )
        created = SubagentCreatedEvent(
            session_id=source.session.id,
            event_type="subagent/created",
            payload=SubagentCreatedPayload(
                child_session_id=child_id,
                child_run_id=run_id,
                owner_run_id=call.run_id,
                tool_call_id=call.call_id,
                description=description,
                prompt=prompt,
                permission="read-only",
                model_snapshot=model,
            ),
            occurred_at=now,
        )
        with self.database.sessions() as transaction:
            transaction.execute(text("BEGIN IMMEDIATE"))
            transaction.add(
                SessionRecord(
                    id=child_id,
                    workspace_id=source.workspace.id,
                    title=description,
                    created_at=now,
                    updated_at=now,
                )
            )
            transaction.flush()
            self.projections.commit_in_transaction(
                transaction,
                EventBatch(session_id=child_id, run_id=None, events=child_events),
            )
            self.projections.commit_in_transaction(
                transaction,
                EventBatch(
                    session_id=source.session.id, run_id=None, events=(created,)
                ),
            )
            transaction.commit()
        return child_id

    def child_state(self, child_id: str):
        with self.database.sessions() as transaction:
            return reduce_session(
                event_to_domain(row)
                for row in transaction.scalars(
                    select(SessionEventRecord)
                    .where(SessionEventRecord.session_id == child_id)
                    .order_by(SessionEventRecord.sequence)
                )
            )

    def settle(self, child_id: str) -> ReducedSubagent:
        owned = self.get(child_id)
        if owned is None:
            raise ToolExecutionError("The subagent does not exist.")
        parent_id, child = owned
        if child.settled is not None:
            return child
        state = self.child_state(child_id)
        run = next(
            (run for run in state.runs if run.run_id == child.created.child_run_id),
            None,
        )
        if run is None:
            if state.next_turn or not any(
                message.discarded for message in state.user_messages
            ):
                raise ToolExecutionError("The subagent has not stopped.")
            status, output, reason = "cancelled", "", "Cancelled before execution."
        else:
            if run.state.value not in {
                "completed",
                "failed",
                "cancelled",
                "interrupted",
            }:
                raise ToolExecutionError("The subagent has not stopped.")
            status, reason = run.state.value, run.pause_reason
            output = next(
                (
                    message.content
                    for message in reversed(run.assistants)
                    if message.content
                ),
                "",
            )
        event = SubagentSettledEvent(
            session_id=parent_id,
            event_type="subagent/settled",
            payload=SubagentSettledPayload(
                child_session_id=child_id,
                owner_run_id=child.created.owner_run_id,
                status=status,
                output=output,
                reason=reason,
            ),
            occurred_at=datetime.now(UTC),
        )
        self.projections.commit(
            EventBatch(session_id=parent_id, run_id=None, events=(event,))
        )
        return self.get(child_id)[1]

    @staticmethod
    def _child(row: SubagentRecord) -> ReducedSubagent:
        return ReducedSubagent(
            created=SubagentCreatedPayload.model_validate(row.created),
            created_at=as_utc(row.created_at),
            created_sequence=row.created_sequence,
            settled=SubagentSettledPayload.model_validate(row.settled)
            if row.settled is not None
            else None,
            settled_at=as_utc(row.settled_at) if row.settled_at is not None else None,
            settled_sequence=row.settled_sequence,
        )
