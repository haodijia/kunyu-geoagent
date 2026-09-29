from collections.abc import Sequence

from dsh.events import AgentEvent, EventBatch, validate_event_draft
from dsh.reducer import reduce_run
from dsh.run_state import ReducedAssistant, ReducedRun, ReducedToolCall
from pydantic import JsonValue
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from kunyu.domain.runs import (
    CreateRunProjection,
    ProjectionConflictError,
    ProjectionNotFoundError,
    Run,
    RunBudget,
    RunModelSnapshot,
    RunProjectionBatch,
    ToolCall,
    ToolCallStatus,
)
from kunyu.persistence import run_records
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    AgentEventRecord,
    MessageRecord,
    RunModelSnapshotRecord,
    RunRecord,
    SessionRecord,
    ToolCallRecord,
)


class SQLAlchemyEventStore:
    """Reduce and commit one run's events and query projections atomically."""

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

    def _commit(self, batch: EventBatch[RunProjectionBatch]) -> tuple[AgentEvent, ...]:
        if batch.run_id is None:
            raise ProjectionConflictError("Run event batches require a run identifier.")
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

            next_sequence = (
                database_session.scalar(
                    select(func.max(AgentEventRecord.sequence)).where(
                        AgentEventRecord.session_id == batch.session_id
                    )
                )
                or 0
            ) + 1
            new_records = tuple(
                run_records.event_record(event, next_sequence + index)
                for index, event in enumerate(validated_events)
            )
            previous_records = database_session.scalars(
                select(AgentEventRecord)
                .where(AgentEventRecord.run_id == batch.run_id)
                .order_by(AgentEventRecord.sequence)
            ).all()
            reduced = reduce_run(
                (
                    *(
                        run_records.event_to_domain(record)
                        for record in previous_records
                    ),
                    *(run_records.event_to_domain(record) for record in new_records),
                )
            )
            if reduced.session_id != batch.session_id or reduced.run_id != batch.run_id:
                raise ProjectionConflictError(
                    "Reduced run ownership differs from its batch."
                )

            self._apply_reduced_projection(
                database_session, batch, reduced, new_records
            )
            database_session.add_all(new_records)
            database_session.commit()
            return tuple(run_records.event_to_domain(record) for record in new_records)

    def _apply_reduced_projection(
        self,
        database_session: Session,
        batch: EventBatch[RunProjectionBatch],
        reduced: ReducedRun,
        new_records: Sequence[AgentEventRecord],
    ) -> None:
        run_record = database_session.get(RunRecord, reduced.run_id)
        if run_record is None:
            creation = batch.projection.creation
            if creation is None:
                raise ProjectionNotFoundError(
                    f"Run '{reduced.run_id}' has no durable creation projection."
                )
            self._create_run(database_session, creation, reduced, new_records)
            run_record = database_session.get(RunRecord, reduced.run_id)
            if run_record is None:
                raise ProjectionConflictError(
                    "Run creation projection was not persisted."
                )
        elif batch.projection.creation is not None:
            raise ProjectionConflictError("An existing run cannot be created again.")

        run = _run_from_reduced(reduced)
        run_records.copy_run_projection(run_record, run)
        run_record.updated_sequence = reduced.updated_sequence
        self._sync_assistants(database_session, reduced)
        self._sync_tool_calls(database_session, reduced)
        database_session.flush()

    def _create_run(
        self,
        database_session: Session,
        creation: CreateRunProjection,
        reduced: ReducedRun,
        new_records: Sequence[AgentEventRecord],
    ) -> None:
        message = creation.user_message
        snapshot = creation.snapshot
        if (
            message.id != reduced.user_message_id
            or message.session_id != reduced.session_id
            or message.run_id != reduced.run_id
            or message.role != "user"
            or message.status != "completed"
            or snapshot.run_id != reduced.run_id
            or snapshot.session_id != reduced.session_id
        ):
            raise ProjectionConflictError("Run creation ownership is inconsistent.")
        user_event = _single_event(new_records, "message.user.appended")
        created_event = _single_event(new_records, "run.created")
        selected_event = _single_event(new_records, "run.model_selected")
        if user_event.payload.get("message_id") != message.id:
            raise ProjectionConflictError(
                "User message event differs from its projection."
            )
        expected_model = _snapshot_model_payload(snapshot)
        if (
            created_event.payload.get("user_message_id") != message.id
            or created_event.payload.get("model_snapshot") != expected_model
            or created_event.payload.get("map_snapshot") != snapshot.map_context
            or created_event.payload.get("scene_snapshot") != snapshot.scene
            or selected_event.payload.get("user_message_id") != message.id
            or selected_event.payload.get("model_snapshot") != expected_model
        ):
            raise ProjectionConflictError(
                "Run snapshot differs from its immutable events."
            )

        database_session.add_all(
            (
                run_records.message_record(
                    message,
                    _next_message_sequence(database_session, reduced.session_id),
                    user_event.sequence,
                ),
                run_records.run_record(
                    _run_from_reduced(reduced), reduced.updated_sequence
                ),
            )
        )
        database_session.flush()
        database_session.add(run_records.snapshot_record(snapshot))
        database_session.flush()

    def _sync_assistants(self, database_session: Session, reduced: ReducedRun) -> None:
        records = {
            record.id: record
            for record in database_session.scalars(
                select(MessageRecord).where(
                    MessageRecord.run_id == reduced.run_id,
                    MessageRecord.role == "assistant",
                )
            ).all()
        }
        expected_ids = {assistant.message_id for assistant in reduced.assistants}
        if set(records) - expected_ids:
            raise ProjectionConflictError(
                "Durable Assistant rows diverge from the event log."
            )
        next_sequence = _next_message_sequence(database_session, reduced.session_id)
        for assistant in reduced.assistants:
            record = records.get(assistant.message_id)
            if record is None:
                record = _assistant_record(reduced, assistant, next_sequence)
                next_sequence += 1
                database_session.add(record)
            else:
                _update_assistant_record(record, reduced, assistant)
        database_session.flush()

    def _sync_tool_calls(self, database_session: Session, reduced: ReducedRun) -> None:
        records = {
            record.id: record
            for record in database_session.scalars(
                select(ToolCallRecord).where(ToolCallRecord.run_id == reduced.run_id)
            ).all()
        }
        expected_ids = {tool.tool_call_id for tool in reduced.tool_calls}
        if set(records) - expected_ids:
            raise ProjectionConflictError(
                "Durable ToolCall rows diverge from the event log."
            )
        for tool in reduced.tool_calls:
            record = records.get(tool.tool_call_id)
            if record is None:
                database_session.add(_tool_record(reduced, tool))
            else:
                _update_tool_record(record, reduced, tool)
        database_session.flush()


def _single_event(
    records: Sequence[AgentEventRecord], event_type: str
) -> AgentEventRecord:
    matches = [record for record in records if record.event_type == event_type]
    if len(matches) != 1:
        raise ProjectionConflictError(
            f"Run creation requires exactly one '{event_type}' event."
        )
    return matches[0]


def _run_from_reduced(reduced: ReducedRun) -> Run:
    budget = reduced.budget
    return Run(
        id=reduced.run_id,
        session_id=reduced.session_id,
        user_message_id=reduced.user_message_id,
        state=reduced.state,
        step=reduced.step,
        attempt=reduced.attempt,
        resume_phase=reduced.resume_phase,
        next_tool_index=reduced.next_tool_index,
        requires_resume=reduced.requires_resume,
        queue_sequence=reduced.queue_sequence,
        pending_confirmation_id=reduced.pending_confirmation_id,
        pause_reason=reduced.pause_reason,
        budget=RunBudget(
            max_model_calls=budget.max_model_calls,
            model_calls=budget.model_calls,
            max_tool_calls=budget.max_tool_calls,
            tool_calls=budget.tool_calls,
            max_active_milliseconds=budget.max_active_milliseconds,
            active_milliseconds=budget.active_milliseconds,
            max_output_codepoints=budget.max_output_codepoints,
            output_codepoints=budget.output_codepoints,
            input_tokens=budget.input_tokens,
            output_tokens=budget.output_tokens,
            total_tokens=budget.total_tokens,
        ),
        created_at=reduced.created_at,
        updated_at=reduced.updated_at,
        updated_sequence=reduced.updated_sequence,
    )


def _snapshot_model_payload(snapshot: RunModelSnapshot) -> dict[str, JsonValue]:
    return {
        "connection_id": snapshot.connection_id,
        "provider_type": snapshot.provider_type.value,
        "protocol": snapshot.protocol.value,
        "base_url": snapshot.base_url,
        "auth_mode": snapshot.auth_mode.value,
        "model_id": snapshot.model_id,
        "reasoning_effort": snapshot.reasoning_effort,
        "connection_revision": snapshot.connection_revision,
        "max_tokens_field": snapshot.max_tokens_field.value,
        "include_usage": snapshot.include_usage,
        "max_output_tokens": snapshot.max_output_tokens,
    }


def _assistant_record(
    reduced: ReducedRun, assistant: ReducedAssistant, sequence: int
) -> MessageRecord:
    return MessageRecord(
        id=assistant.message_id,
        session_id=reduced.session_id,
        sequence=sequence,
        role="assistant",
        content=assistant.content,
        run_id=reduced.run_id,
        step=assistant.step,
        attempt=assistant.attempt,
        status=assistant.status,
        content_length=len(assistant.content),
        updated_sequence=assistant.updated_sequence,
        created_at=assistant.created_at,
        updated_at=assistant.updated_at,
    )


def _update_assistant_record(
    record: MessageRecord, reduced: ReducedRun, assistant: ReducedAssistant
) -> None:
    if (
        record.session_id != reduced.session_id
        or record.run_id != reduced.run_id
        or record.role != "assistant"
        or record.step != assistant.step
        or record.attempt != assistant.attempt
    ):
        raise ProjectionConflictError("Assistant ownership differs from the event log.")
    record.content = assistant.content
    record.status = assistant.status
    record.content_length = len(assistant.content)
    record.updated_at = assistant.updated_at
    record.updated_sequence = assistant.updated_sequence


def _tool_record(reduced: ReducedRun, tool: ReducedToolCall) -> ToolCallRecord:
    call = ToolCall(
        id=tool.tool_call_id,
        session_id=reduced.session_id,
        run_id=reduced.run_id,
        message_id=tool.message_id,
        step=tool.step,
        attempt=tool.attempt,
        provider_call_id=tool.provider_call_id,
        batch_index=tool.batch_index,
        name=tool.name,
        arguments=dict(tool.arguments),
        status=ToolCallStatus(tool.status),
        result=tool.result,
        error_code=tool.error_code,
        error_summary=tool.error_summary,
        created_at=tool.created_at,
        updated_at=tool.updated_at,
        updated_sequence=tool.updated_sequence,
    )
    return run_records.tool_call_record(call, tool.updated_sequence)


def _update_tool_record(
    record: ToolCallRecord, reduced: ReducedRun, tool: ReducedToolCall
) -> None:
    if (
        record.session_id != reduced.session_id
        or record.run_id != reduced.run_id
        or record.message_id != tool.message_id
        or record.step != tool.step
        or record.attempt != tool.attempt
        or record.provider_call_id != tool.provider_call_id
        or record.batch_index != tool.batch_index
        or record.name != tool.name
        or record.arguments != tool.arguments
    ):
        raise ProjectionConflictError("ToolCall identity differs from the event log.")
    record.status = tool.status
    record.result = tool.result
    record.error_code = tool.error_code
    record.error_summary = tool.error_summary
    record.updated_at = tool.updated_at
    record.updated_sequence = tool.updated_sequence


def _next_message_sequence(database_session: Session, session_id: str) -> int:
    return (
        database_session.scalar(
            select(func.max(MessageRecord.sequence)).where(
                MessageRecord.session_id == session_id
            )
        )
        or 0
    ) + 1
