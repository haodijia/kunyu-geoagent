from uuid import uuid4

from pydantic import TypeAdapter

from kunyu.agent.runtime.events import AgentEvent, EventDraft, ResumePhase, RunState
from kunyu.agent.runtime.tool_content import ToolContentBlock
from kunyu.domain.messages import Message
from kunyu.domain.model_connections import (
    MaxTokensField,
    ModelAuthMode,
    ModelProtocol,
    ModelProviderType,
)
from kunyu.domain.model_images import ModelImageInput
from kunyu.domain.runs import (
    Run,
    RunBudget,
    RunModelSnapshot,
    ToolCall,
    ToolCallStatus,
)
from kunyu.persistence.models import (
    MessageRecord,
    RunModelSnapshotRecord,
    RunRecord,
    SessionEventRecord,
    ToolCallRecord,
)
from kunyu.persistence.time import as_utc


def event_record(event: EventDraft, sequence: int) -> SessionEventRecord:
    return SessionEventRecord(
        id=f"evt_{uuid4().hex}",
        session_id=event.session_id,
        run_id=event.run_id,
        sequence=sequence,
        event_type=event.event_type,
        payload=event.payload.model_dump(mode="json"),
        occurred_at=event.occurred_at,
    )


def message_record(
    message: Message, sequence: int, updated_sequence: int
) -> MessageRecord:
    return MessageRecord(
        id=message.id,
        session_id=message.session_id,
        sequence=sequence,
        role=message.role,
        content=message.content,
        run_id=message.run_id,
        step=message.step,
        attempt=message.attempt,
        status=message.status,
        content_length=message.content_length,
        updated_sequence=updated_sequence,
        created_at=message.created_at,
        updated_at=message.updated_at,
    )


def run_record(run: Run, updated_sequence: int) -> RunRecord:
    record = RunRecord(
        id=run.id,
        session_id=run.session_id,
        user_message_id=run.user_message_id,
    )
    copy_run_projection(record, run)
    record.created_at = run.created_at
    record.updated_sequence = updated_sequence
    return record


def copy_run_projection(record: RunRecord, run: Run) -> None:
    budget = run.budget
    record.state = run.state.value
    record.step = run.step
    record.attempt = run.attempt
    record.resume_phase = run.resume_phase.value
    record.next_tool_index = run.next_tool_index
    record.requires_resume = run.requires_resume
    record.queue_sequence = run.queue_sequence
    record.pending_confirmation_id = run.pending_confirmation_id
    record.pause_reason = run.pause_reason
    record.max_model_calls = budget.max_model_calls
    record.model_calls = budget.model_calls
    record.max_tool_calls = budget.max_tool_calls
    record.tool_calls = budget.tool_calls
    record.max_active_milliseconds = budget.max_active_milliseconds
    record.active_milliseconds = budget.active_milliseconds
    record.max_output_codepoints = budget.max_output_codepoints
    record.output_codepoints = budget.output_codepoints
    record.input_tokens = budget.input_tokens
    record.output_tokens = budget.output_tokens
    record.total_tokens = budget.total_tokens
    record.updated_at = run.updated_at


def snapshot_record(snapshot: RunModelSnapshot) -> RunModelSnapshotRecord:
    return RunModelSnapshotRecord(
        run_id=snapshot.run_id,
        session_id=snapshot.session_id,
        connection_id=snapshot.connection_id,
        provider_type=snapshot.provider_type.value,
        protocol=snapshot.protocol.value,
        base_url=snapshot.base_url,
        auth_mode=snapshot.auth_mode.value,
        model_id=snapshot.model_id,
        reasoning_effort=snapshot.reasoning_effort,
        connection_revision=snapshot.connection_revision,
        max_tokens_field=snapshot.max_tokens_field.value,
        include_usage=snapshot.include_usage,
        image_input=snapshot.image_input.model_dump(mode="json"),
        max_output_tokens=snapshot.max_output_tokens,
        map_context=snapshot.map_context,
        scene=snapshot.scene,
    )


def tool_call_record(call: ToolCall, updated_sequence: int) -> ToolCallRecord:
    return ToolCallRecord(
        id=call.id,
        session_id=call.session_id,
        run_id=call.run_id,
        message_id=call.message_id,
        step=call.step,
        attempt=call.attempt,
        provider_call_id=call.provider_call_id,
        batch_index=call.batch_index,
        name=call.name,
        arguments=call.arguments,
        status=call.status.value,
        result=call.result,
        content=[block.model_dump(mode="json") for block in call.content],
        error_code=call.error_code,
        error_summary=call.error_summary,
        created_at=call.created_at,
        updated_at=call.updated_at,
        updated_sequence=updated_sequence,
    )


def run_to_domain(record: RunRecord) -> Run:
    return Run(
        id=record.id,
        session_id=record.session_id,
        user_message_id=record.user_message_id,
        state=RunState(record.state),
        step=record.step,
        attempt=record.attempt,
        resume_phase=ResumePhase(record.resume_phase),
        next_tool_index=record.next_tool_index,
        requires_resume=record.requires_resume,
        queue_sequence=record.queue_sequence,
        pending_confirmation_id=record.pending_confirmation_id,
        pause_reason=record.pause_reason,
        budget=RunBudget(
            max_model_calls=record.max_model_calls,
            model_calls=record.model_calls,
            max_tool_calls=record.max_tool_calls,
            tool_calls=record.tool_calls,
            max_active_milliseconds=record.max_active_milliseconds,
            active_milliseconds=record.active_milliseconds,
            max_output_codepoints=record.max_output_codepoints,
            output_codepoints=record.output_codepoints,
            input_tokens=record.input_tokens,
            output_tokens=record.output_tokens,
            total_tokens=record.total_tokens,
        ),
        created_at=as_utc(record.created_at),
        updated_at=as_utc(record.updated_at),
        updated_sequence=record.updated_sequence,
    )


def snapshot_to_domain(record: RunModelSnapshotRecord) -> RunModelSnapshot:
    return RunModelSnapshot(
        run_id=record.run_id,
        session_id=record.session_id,
        connection_id=record.connection_id,
        provider_type=ModelProviderType(record.provider_type),
        protocol=ModelProtocol(record.protocol),
        base_url=record.base_url,
        auth_mode=ModelAuthMode(record.auth_mode),
        model_id=record.model_id,
        reasoning_effort=record.reasoning_effort,
        connection_revision=record.connection_revision,
        max_tokens_field=MaxTokensField(record.max_tokens_field),
        include_usage=record.include_usage,
        image_input=ModelImageInput.model_validate(record.image_input),
        max_output_tokens=record.max_output_tokens,
        map_context=record.map_context,
        scene=record.scene,
    )


def tool_call_to_domain(record: ToolCallRecord) -> ToolCall:
    return ToolCall(
        id=record.id,
        session_id=record.session_id,
        run_id=record.run_id,
        message_id=record.message_id,
        step=record.step,
        attempt=record.attempt,
        provider_call_id=record.provider_call_id,
        batch_index=record.batch_index,
        name=record.name,
        arguments=record.arguments,
        status=ToolCallStatus(record.status),
        result=record.result,
        content=TypeAdapter(tuple[ToolContentBlock, ...]).validate_python(
            record.content
        ),
        error_code=record.error_code,
        error_summary=record.error_summary,
        created_at=as_utc(record.created_at),
        updated_at=as_utc(record.updated_at),
        updated_sequence=record.updated_sequence,
    )


def event_to_domain(record: SessionEventRecord) -> AgentEvent:
    return AgentEvent(
        id=record.id,
        session_id=record.session_id,
        sequence=record.sequence,
        event_type=record.event_type,
        payload=record.payload,
        occurred_at=as_utc(record.occurred_at),
        run_id=record.run_id,
    )
