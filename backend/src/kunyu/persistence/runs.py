from collections.abc import Sequence

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from dsh.events import AgentEvent, EventBatch, EventDraft, validate_event_draft
from kunyu.domain.runs import (
    AddAssistantProjection,
    AddToolCallsProjection,
    AppendAssistantDeltaProjection,
    CompleteAssistantProjection,
    CreateRunProjection,
    ProjectionConflictError,
    ProjectionNotFoundError,
    Run,
    RunModelSnapshot,
    RunProjectionBatch,
    SettleAssistantProjection,
    ToolCall,
    UpdateRunProjection,
    UpdateToolCallProjection,
)
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    AgentEventRecord,
    MessageRecord,
    RunModelSnapshotRecord,
    RunRecord,
    SessionRecord,
    ToolCallRecord,
)
from kunyu.persistence.run_records import (
    copy_run_projection as _copy_run_projection,
    event_record as _event_record,
    event_to_domain as _event_to_domain,
    message_record as _message_record,
    run_record as _run_record,
    run_to_domain as _run_to_domain,
    snapshot_record as _snapshot_record,
    snapshot_to_domain as _snapshot_to_domain,
    tool_call_record as _tool_call_record,
    tool_call_to_domain as _tool_call_to_domain,
)


class SQLAlchemyEventStore:
    """Commit run projections and their ordered events in one SQLite transaction."""

    def __init__(self, database: Database) -> None:
        self._database = database

    async def commit(
        self, batch: EventBatch[RunProjectionBatch]
    ) -> tuple[AgentEvent, ...]:
        return self._commit(batch)

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
            return tuple(_event_to_domain(record) for record in records)

    def get_run(self, run_id: str) -> Run | None:
        with self._database.sessions() as database_session:
            record = database_session.get(RunRecord, run_id)
            return _run_to_domain(record) if record is not None else None

    def get_snapshot(self, run_id: str) -> RunModelSnapshot | None:
        with self._database.sessions() as database_session:
            record = database_session.get(RunModelSnapshotRecord, run_id)
            return _snapshot_to_domain(record) if record is not None else None

    def list_tool_calls(self, run_id: str) -> tuple[ToolCall, ...]:
        statement = (
            select(ToolCallRecord)
            .where(ToolCallRecord.run_id == run_id)
            .order_by(ToolCallRecord.step, ToolCallRecord.attempt, ToolCallRecord.batch_index)
        )
        with self._database.sessions() as database_session:
            return tuple(
                _tool_call_to_domain(record)
                for record in database_session.scalars(statement).all()
            )

    def _commit(
        self, batch: EventBatch[RunProjectionBatch]
    ) -> tuple[AgentEvent, ...]:
        validated_events = tuple(
            validate_event_draft(event.model_dump(mode="python"))
            for event in batch.events
        )
        with self._database.sessions() as database_session:
            database_session.execute(text("BEGIN IMMEDIATE"))
            if database_session.get(SessionRecord, batch.session_id) is None:
                raise ProjectionNotFoundError(
                    f"Session '{batch.session_id}' was not found."
                )

            next_event_sequence = (
                database_session.scalar(
                    select(func.max(AgentEventRecord.sequence)).where(
                        AgentEventRecord.session_id == batch.session_id
                    )
                )
                or 0
            ) + 1
            event_records = tuple(
                _event_record(event, next_event_sequence + index)
                for index, event in enumerate(validated_events)
            )
            self._apply_projection(
                database_session,
                batch,
                tuple(record.sequence for record in event_records),
            )
            database_session.add_all(event_records)
            database_session.commit()
            return tuple(_event_to_domain(record) for record in event_records)

    def _apply_projection(
        self,
        database_session: Session,
        batch: EventBatch[RunProjectionBatch],
        event_sequences: tuple[int, ...],
    ) -> None:
        for mutation in batch.projection.mutations:
            if isinstance(mutation, CreateRunProjection):
                self._create_run(
                    database_session, batch, mutation, event_sequences
                )
            elif isinstance(mutation, AddAssistantProjection):
                self._add_assistant(
                    database_session, batch, mutation, event_sequences
                )
            elif isinstance(mutation, AppendAssistantDeltaProjection):
                self._append_delta(
                    database_session, batch, mutation, event_sequences
                )
            elif isinstance(mutation, CompleteAssistantProjection):
                self._complete_assistant(
                    database_session, batch, mutation, event_sequences
                )
            elif isinstance(mutation, SettleAssistantProjection):
                self._settle_assistant(
                    database_session, batch, mutation, event_sequences
                )
            elif isinstance(mutation, AddToolCallsProjection):
                self._add_tool_calls(
                    database_session, batch, mutation, event_sequences
                )
            elif isinstance(mutation, UpdateToolCallProjection):
                self._update_tool_call(
                    database_session, batch, mutation, event_sequences
                )
            elif isinstance(mutation, UpdateRunProjection):
                self._update_run(
                    database_session, batch, mutation, event_sequences
                )

    def _create_run(
        self,
        database_session: Session,
        batch: EventBatch[RunProjectionBatch],
        mutation: CreateRunProjection,
        event_sequences: tuple[int, ...],
    ) -> None:
        run = mutation.run
        snapshot = mutation.snapshot
        message = mutation.user_message
        if (
            batch.run_id != run.id
            or run.session_id != batch.session_id
            or snapshot.run_id != run.id
            or snapshot.session_id != batch.session_id
            or message.session_id != batch.session_id
            or message.run_id != run.id
            or run.user_message_id != message.id
            or message.role != "user"
        ):
            raise ProjectionConflictError("Run creation ownership is inconsistent.")
        user_event = _projection_event(
            batch.events, mutation.user_event_index, "message.user.appended"
        )
        run_event = _projection_event(
            batch.events, mutation.run_event_index, "run.created"
        )
        if (
            getattr(user_event.payload, "message_id", None) != message.id
            or getattr(run_event.payload, "user_message_id", None) != message.id
        ):
            raise ProjectionConflictError("Run creation events do not match projection.")
        message_updated_sequence = _event_sequence(
            event_sequences, mutation.user_event_index
        )
        run_updated_sequence = _event_sequence(
            event_sequences, mutation.run_event_index
        )
        message_sequence = _next_message_sequence(database_session, batch.session_id)
        database_session.add_all(
            (
                _message_record(message, message_sequence, message_updated_sequence),
                _run_record(run, run_updated_sequence),
            )
        )
        database_session.flush()
        database_session.add(_snapshot_record(snapshot))
        database_session.flush()

    def _add_assistant(
        self,
        database_session: Session,
        batch: EventBatch[RunProjectionBatch],
        mutation: AddAssistantProjection,
        event_sequences: tuple[int, ...],
    ) -> None:
        message = mutation.message
        _require_run(database_session, batch)
        if (
            message.session_id != batch.session_id
            or message.run_id != batch.run_id
            or message.role != "assistant"
            or message.content
            or message.content_length != 0
            or message.status != "streaming"
        ):
            raise ProjectionConflictError("Assistant start projection is invalid.")
        event = _projection_event(
            batch.events, mutation.event_index, "message.assistant.started"
        )
        if (
            getattr(event.payload, "message_id", None) != message.id
            or getattr(event.payload, "step", None) != message.step
            or getattr(event.payload, "attempt", None) != message.attempt
        ):
            raise ProjectionConflictError(
                "Assistant start event does not match projection."
            )
        updated_sequence = _event_sequence(event_sequences, mutation.event_index)
        database_session.add(
            _message_record(
                message,
                _next_message_sequence(database_session, batch.session_id),
                updated_sequence,
            )
        )
        database_session.flush()

    def _append_delta(
        self,
        database_session: Session,
        batch: EventBatch[RunProjectionBatch],
        mutation: AppendAssistantDeltaProjection,
        event_sequences: tuple[int, ...],
    ) -> None:
        event = _projection_event(
            batch.events, mutation.event_index, "message.assistant.delta"
        )
        if (
            getattr(event.payload, "message_id", None) != mutation.message_id
            or getattr(event.payload, "step", None) != mutation.step
            or getattr(event.payload, "attempt", None) != mutation.attempt
            or getattr(event.payload, "offset", None) != mutation.offset
            or getattr(event.payload, "text", None) != mutation.text
        ):
            raise ProjectionConflictError(
                "Assistant delta event does not match projection."
            )
        record = _require_assistant(database_session, batch, mutation.message_id)
        if (
            record.status != "streaming"
            or record.step != mutation.step
            or record.attempt != mutation.attempt
            or record.content_length != mutation.offset
            or len(record.content) != mutation.offset
            or not mutation.text
        ):
            raise ProjectionConflictError(
                "Assistant delta does not continue the persisted codepoint offset."
            )
        record.content += mutation.text
        record.content_length += len(mutation.text)
        record.updated_at = mutation.occurred_at
        record.updated_sequence = _event_sequence(
            event_sequences, mutation.event_index
        )

    def _complete_assistant(
        self,
        database_session: Session,
        batch: EventBatch[RunProjectionBatch],
        mutation: CompleteAssistantProjection,
        event_sequences: tuple[int, ...],
    ) -> None:
        event = _projection_event(
            batch.events, mutation.event_index, "message.assistant.completed"
        )
        if (
            getattr(event.payload, "message_id", None) != mutation.message_id
            or getattr(event.payload, "step", None) != mutation.step
            or getattr(event.payload, "attempt", None) != mutation.attempt
            or getattr(event.payload, "content_length", None)
            != mutation.content_length
        ):
            raise ProjectionConflictError(
                "Assistant completion event does not match projection."
            )
        record = _require_assistant(database_session, batch, mutation.message_id)
        if (
            record.status != "streaming"
            or record.step != mutation.step
            or record.attempt != mutation.attempt
            or record.content_length != mutation.content_length
        ):
            raise ProjectionConflictError(
                "Assistant completion does not match persisted progress."
            )
        record.status = mutation.status
        record.updated_at = mutation.occurred_at
        record.updated_sequence = _event_sequence(
            event_sequences, mutation.event_index
        )

    def _settle_assistant(
        self,
        database_session: Session,
        batch: EventBatch[RunProjectionBatch],
        mutation: SettleAssistantProjection,
        event_sequences: tuple[int, ...],
    ) -> None:
        expected_events = {
            "interrupted": "run.interrupted",
            "failed": "run.failed",
            "cancelled": "run.cancelled",
        }
        _projection_event(
            batch.events,
            mutation.event_index,
            expected_events[mutation.status],
        )
        record = _require_assistant(database_session, batch, mutation.message_id)
        if (
            record.status != "streaming"
            or record.content_length != mutation.content_length
        ):
            raise ProjectionConflictError(
                "Assistant settlement does not match persisted progress."
            )
        record.status = mutation.status
        record.updated_at = mutation.occurred_at
        record.updated_sequence = _event_sequence(
            event_sequences, mutation.event_index
        )

    def _add_tool_calls(
        self,
        database_session: Session,
        batch: EventBatch[RunProjectionBatch],
        mutation: AddToolCallsProjection,
        event_sequences: tuple[int, ...],
    ) -> None:
        _require_run(database_session, batch)
        if not mutation.calls:
            raise ProjectionConflictError("A tool-call batch must not be empty.")
        for index, call in enumerate(mutation.calls):
            if call.session_id != batch.session_id or call.run_id != batch.run_id:
                raise ProjectionConflictError("Tool call ownership is inconsistent.")
            sequence = _event_sequence(
                event_sequences, mutation.first_event_index + index
            )
            event = _projection_event(
                batch.events,
                mutation.first_event_index + index,
                "tool.requested",
            )
            if (
                getattr(event.payload, "tool_call_id", None) != call.id
                or getattr(event.payload, "provider_call_id", None)
                != call.provider_call_id
                or getattr(event.payload, "message_id", None) != call.message_id
                or getattr(event.payload, "batch_index", None) != call.batch_index
            ):
                raise ProjectionConflictError(
                    "Tool request event does not match projection."
                )
            database_session.add(_tool_call_record(call, sequence))
        database_session.flush()

    def _update_tool_call(
        self,
        database_session: Session,
        batch: EventBatch[RunProjectionBatch],
        mutation: UpdateToolCallProjection,
        event_sequences: tuple[int, ...],
    ) -> None:
        status_events = {
            "running": "tool.started",
            "completed": "tool.completed",
            "failed": "tool.failed",
            "cancelled": "tool.cancelled",
        }
        expected_event = status_events.get(mutation.status.value)
        if expected_event is None:
            raise ProjectionConflictError("Pending tool calls cannot be restored by update.")
        event = _projection_event(
            batch.events, mutation.event_index, expected_event
        )
        if getattr(event.payload, "tool_call_id", None) != mutation.tool_call_id:
            raise ProjectionConflictError("Tool event does not match projection.")
        record = database_session.get(ToolCallRecord, mutation.tool_call_id)
        if (
            record is None
            or record.session_id != batch.session_id
            or record.run_id != batch.run_id
        ):
            raise ProjectionNotFoundError(
                f"Tool call '{mutation.tool_call_id}' was not found in this run."
            )
        record.status = mutation.status.value
        record.result = mutation.result
        record.error_code = mutation.error_code
        record.error_summary = mutation.error_summary
        record.updated_at = mutation.occurred_at
        record.updated_sequence = _event_sequence(
            event_sequences, mutation.event_index
        )

    def _update_run(
        self,
        database_session: Session,
        batch: EventBatch[RunProjectionBatch],
        mutation: UpdateRunProjection,
        event_sequences: tuple[int, ...],
    ) -> None:
        record = _require_run(database_session, batch)
        if mutation.run.id != record.id or mutation.run.session_id != record.session_id:
            raise ProjectionConflictError("Run projection ownership is inconsistent.")
        _copy_run_projection(record, mutation.run)
        record.updated_sequence = _event_sequence(
            event_sequences, mutation.event_index
        )


def _event_sequence(sequences: Sequence[int], event_index: int) -> int:
    if event_index < 0 or event_index >= len(sequences):
        raise ProjectionConflictError("Projection references an absent event.")
    return sequences[event_index]


def _projection_event(
    events: Sequence[EventDraft], event_index: int, expected_type: str
) -> EventDraft:
    if event_index < 0 or event_index >= len(events):
        raise ProjectionConflictError("Projection references an absent event.")
    event = events[event_index]
    if event.event_type != expected_type:
        raise ProjectionConflictError(
            f"Projection requires event '{expected_type}', got '{event.event_type}'."
        )
    return event


def _next_message_sequence(database_session: Session, session_id: str) -> int:
    return (
        database_session.scalar(
            select(func.max(MessageRecord.sequence)).where(
                MessageRecord.session_id == session_id
            )
        )
        or 0
    ) + 1


def _require_run(
    database_session: Session, batch: EventBatch[RunProjectionBatch]
) -> RunRecord:
    if batch.run_id is None:
        raise ProjectionConflictError("Run projection requires a run identifier.")
    record = database_session.get(RunRecord, batch.run_id)
    if record is None or record.session_id != batch.session_id:
        raise ProjectionNotFoundError(
            f"Run '{batch.run_id}' was not found in this session."
        )
    return record


def _require_assistant(
    database_session: Session,
    batch: EventBatch[RunProjectionBatch],
    message_id: str,
) -> MessageRecord:
    record = database_session.get(MessageRecord, message_id)
    if (
        record is None
        or record.session_id != batch.session_id
        or record.run_id != batch.run_id
        or record.role != "assistant"
    ):
        raise ProjectionNotFoundError(
            f"Assistant message '{message_id}' was not found in this run."
        )
    return record
