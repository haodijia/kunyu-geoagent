"""Atomic event append and deterministic Agent query projection rebuilds."""

from collections.abc import Sequence

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from kunyu.agent.runtime.events import AgentEvent, EventBatch, validate_event_draft
from kunyu.agent.runtime.run_state import (
    ReducedAssistant,
    ReducedConfirmation,
    ReducedRun,
    ReducedToolCall,
)
from kunyu.agent.runtime.session_reducer import reduce_session
from kunyu.agent.runtime.session_state import ReducedSession, ReducedUserMessage
from kunyu.domain.confirmations import Confirmation, ConfirmationStatus
from kunyu.domain.model_connections import (
    MaxTokensField,
    ModelAuthMode,
    ModelProtocol,
    ModelProviderType,
)
from kunyu.domain.runs import (
    ProjectionConflictError,
    ProjectionNotFoundError,
    Run,
    RunBudget,
    RunModelSnapshot,
    ToolCall,
    ToolCallStatus,
)
from kunyu.persistence import run_records
from kunyu.persistence.confirmations import confirmation_record
from kunyu.persistence.database import Database
from kunyu.persistence.event_publications import (
    SessionEventPublication,
    stage_publication,
)
from kunyu.persistence.models import (
    ConfirmationRecord,
    MessageRecord,
    RunModelSnapshotRecord,
    RunRecord,
    SessionEventRecord,
    SessionRecord,
    ToolCallRecord,
)


class SQLAlchemyAgentProjectionService:
    """Use the same session reducer for normal appends and explicit rebuilds."""

    def __init__(self, database: Database) -> None:
        self._database = database

    def commit(self, batch: EventBatch) -> tuple[AgentEvent, ...]:
        with self._database.sessions() as database_session:
            database_session.execute(text("BEGIN IMMEDIATE"))
            events = self.commit_in_transaction(database_session, batch)
            database_session.commit()
            return events

    def commit_in_transaction(
        self, database_session: Session, batch: EventBatch
    ) -> tuple[AgentEvent, ...]:
        if database_session.get(SessionRecord, batch.session_id) is None:
            raise ProjectionNotFoundError(
                f"Session '{batch.session_id}' was not found."
            )
        validated_events = tuple(
            validate_event_draft(event.model_dump(mode="python"))
            for event in batch.events
        )
        previous_records = _event_records(database_session, batch.session_id)
        next_sequence = len(previous_records) + 1
        new_records = tuple(
            run_records.event_record(event, next_sequence + index)
            for index, event in enumerate(validated_events)
        )
        reduced = reduce_session(
            (
                *(run_records.event_to_domain(record) for record in previous_records),
                *(run_records.event_to_domain(record) for record in new_records),
            )
        )
        if reduced.session_id != batch.session_id:
            raise ProjectionConflictError(
                "Reduced session ownership differs from its event batch."
            )
        database_session.add_all(new_records)
        self._replace_session_projections(database_session, reduced)
        database_session.flush()
        committed = tuple(run_records.event_to_domain(record) for record in new_records)
        stage_publication(
            database_session,
            SessionEventPublication(
                committed,
                reduce_session(
                    run_records.event_to_domain(record) for record in previous_records
                )
                if previous_records
                and any(
                    event.event_type == "agent/inbox/spliced" for event in committed
                )
                else None,
                reduced,
            ),
        )
        return committed

    def rebuild_session(self, session_id: str) -> ReducedSession:
        with self._database.sessions() as database_session:
            database_session.execute(text("BEGIN IMMEDIATE"))
            if database_session.get(SessionRecord, session_id) is None:
                raise ProjectionNotFoundError(f"Session '{session_id}' was not found.")
            reduced = self._reduce_persisted_session(database_session, session_id)
            self._replace_session_projections(database_session, reduced)
            database_session.commit()
            return reduced

    def rebuild_all(self) -> tuple[ReducedSession, ...]:
        with self._database.sessions() as database_session:
            database_session.execute(text("BEGIN IMMEDIATE"))
            session_ids = tuple(
                database_session.scalars(
                    select(SessionRecord.id).order_by(SessionRecord.id)
                ).all()
            )
            reduced_sessions = tuple(
                self._reduce_persisted_session(database_session, session_id)
                for session_id in session_ids
            )
            for reduced in reduced_sessions:
                self._replace_session_projections(database_session, reduced)
            database_session.commit()
            return reduced_sessions

    def _reduce_persisted_session(
        self, database_session: Session, session_id: str
    ) -> ReducedSession:
        return reduce_session(
            run_records.event_to_domain(record)
            for record in _event_records(database_session, session_id)
        )

    def _replace_session_projections(
        self, database_session: Session, reduced: ReducedSession
    ) -> None:
        session_id = reduced.session_id
        database_session.execute(
            delete(ConfirmationRecord).where(
                ConfirmationRecord.session_id == session_id
            )
        )
        database_session.execute(
            delete(ToolCallRecord).where(ToolCallRecord.session_id == session_id)
        )
        database_session.execute(
            delete(RunModelSnapshotRecord).where(
                RunModelSnapshotRecord.session_id == session_id
            )
        )
        database_session.execute(
            delete(RunRecord).where(RunRecord.session_id == session_id)
        )
        database_session.execute(
            delete(MessageRecord).where(MessageRecord.session_id == session_id)
        )

        messages = _message_records(reduced)
        runs = tuple(_run_record(run) for run in reduced.runs)
        database_session.add_all((*messages, *runs))
        database_session.flush()

        snapshots = tuple(_snapshot_record(run) for run in reduced.runs)
        tools = tuple(
            _tool_record(run, tool) for run in reduced.runs for tool in run.tool_calls
        )
        database_session.add_all((*snapshots, *tools))
        database_session.flush()
        confirmations = tuple(
            _confirmation_record(run, confirmation)
            for run in reduced.runs
            for confirmation in run.confirmations
        )
        database_session.add_all(confirmations)
        database_session.flush()


def _event_records(
    database_session: Session, session_id: str
) -> Sequence[SessionEventRecord]:
    return database_session.scalars(
        select(SessionEventRecord)
        .where(SessionEventRecord.session_id == session_id)
        .order_by(SessionEventRecord.sequence)
    ).all()


def _message_records(reduced: ReducedSession) -> tuple[MessageRecord, ...]:
    pending: list[tuple[int, MessageRecord]] = []
    for message in reduced.user_messages:
        pending.append((message.created_sequence, _user_message_record(message)))
    for run in reduced.runs:
        for assistant in run.assistants:
            pending.append(
                (
                    assistant.created_sequence,
                    _assistant_message_record(run, assistant),
                )
            )
    pending.sort(key=lambda item: item[0])
    for sequence, (_, record) in enumerate(pending, start=1):
        record.sequence = sequence
    return tuple(record for _, record in pending)


def _user_message_record(message: ReducedUserMessage) -> MessageRecord:
    return MessageRecord(
        id=message.message_id,
        session_id=message.session_id,
        sequence=0,
        role="user",
        content=message.content,
        attachments=[ref.model_dump(mode="json") for ref in message.attachments],
        run_id=message.run_id,
        step=None,
        attempt=None,
        status="cancelled" if message.discarded else "completed",
        content_length=len(message.content),
        updated_sequence=message.updated_sequence,
        created_at=message.created_at,
        updated_at=message.created_at,
    )


def _assistant_message_record(
    run: ReducedRun, assistant: ReducedAssistant
) -> MessageRecord:
    return MessageRecord(
        id=assistant.message_id,
        session_id=run.session_id,
        sequence=0,
        role="assistant",
        content=assistant.content,
        attachments=[],
        run_id=run.run_id,
        step=assistant.step,
        attempt=assistant.attempt,
        status=assistant.status,
        content_length=len(assistant.content),
        updated_sequence=assistant.updated_sequence,
        created_at=assistant.created_at,
        updated_at=assistant.updated_at,
    )


def _run_record(reduced: ReducedRun) -> RunRecord:
    budget = reduced.budget
    run = Run(
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
    return run_records.run_record(run, reduced.updated_sequence)


def _snapshot_record(reduced: ReducedRun) -> RunModelSnapshotRecord:
    model = reduced.model_snapshot
    snapshot = RunModelSnapshot(
        run_id=reduced.run_id,
        session_id=reduced.session_id,
        connection_id=model.connection_id,
        provider_type=ModelProviderType(model.provider_type),
        protocol=ModelProtocol(model.protocol),
        base_url=model.base_url,
        auth_mode=ModelAuthMode(model.auth_mode),
        model_id=model.model_id,
        reasoning_effort=model.reasoning_effort,
        connection_revision=model.connection_revision,
        max_tokens_field=MaxTokensField(model.max_tokens_field),
        include_usage=model.include_usage,
        max_output_tokens=model.max_output_tokens,
        map_context=dict(reduced.map_snapshot),
        scene=(
            dict(reduced.scene_snapshot) if reduced.scene_snapshot is not None else None
        ),
    )
    return run_records.snapshot_record(snapshot)


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


def _confirmation_record(
    reduced: ReducedRun, confirmation: ReducedConfirmation
) -> ConfirmationRecord:
    return confirmation_record(
        Confirmation(
            id=confirmation.confirmation_id,
            session_id=reduced.session_id,
            run_id=reduced.run_id,
            tool_call_id=confirmation.tool_call_id,
            workspace_id=confirmation.workspace_id,
            name=confirmation.name,
            arguments=dict(confirmation.arguments),
            summary=confirmation.summary,
            side_effect=confirmation.side_effect,
            status=ConfirmationStatus(confirmation.status),
            decided_at=confirmation.decided_at,
            created_at=confirmation.created_at,
            updated_at=confirmation.updated_at,
            updated_sequence=confirmation.updated_sequence,
        )
    )
