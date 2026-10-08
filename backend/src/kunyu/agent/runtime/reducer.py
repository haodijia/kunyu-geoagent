"""Deterministically derive one run projection from its committed event log."""

import json
from collections.abc import Iterable
from dataclasses import replace
from datetime import datetime
from typing import Literal, Protocol

from kunyu.agent.runtime.assistant_stream import (
    FinishChunk,
    RawChunk,
    UsageChunk,
    expand_assistant_stream,
)
from kunyu.agent.runtime.block_assembler import BlockAssembler
from kunyu.agent.runtime.content import (
    ReasoningBlock,
    TextBlock,
    ToolCallBlock,
    content_codepoints,
    content_text,
)
from kunyu.agent.runtime.events import (
    ALLOWED_RUN_TRANSITIONS,
    TERMINAL_RUN_STATES,
    AgentEvent,
    AssistantCompletedEvent,
    AssistantDeltaEvent,
    AssistantReasoningDeltaEvent,
    AssistantStartedEvent,
    BudgetReservedEvent,
    BudgetSettledEvent,
    BudgetUsagePayload,
    ConfirmationRequestedEvent,
    ConfirmationResolvedEvent,
    EventDraft,
    ModelAttemptFinishedEvent,
    PlanExitSelectedEvent,
    QuestionRequestedEvent,
    QuestionResolvedEvent,
    RequestHeaderEvent,
    ResumePhase,
    RetryScheduledEvent,
    RetryStartedEvent,
    RunCreatedEvent,
    RunModelSelectedEvent,
    RunProgressEvent,
    RunState,
    RunTerminalEvent,
    StepDecisionEvent,
    TodoWriteEvent,
    ToolCompletedEvent,
    ToolFailedEvent,
    ToolProgressEvent,
    ToolRequestedEvent,
    UserMessageAppendedEvent,
    validate_event_draft,
)
from kunyu.agent.runtime.models import BlockEnd, ReasoningDelta, TextDelta
from kunyu.agent.runtime.retry_policy import NormalRetryPolicy, retry_policy_key
from kunyu.agent.runtime.run_state import (
    AssistantStatus,
    ReducedAssistant,
    ReducedBudget,
    ReducedConfirmation,
    ReducedQuestion,
    ReducedRun,
    ReducedStepDecision,
    ReducedToolCall,
    RunReductionError,
    _Assistant,
    _Budget,
    _Confirmation,
    _Reservation,
    _State,
    _ToolCall,
)
from kunyu.agent.runtime.todos import TODO_LIST_ADAPTER


def reduce_run(events: Iterable[AgentEvent]) -> ReducedRun:
    """Fold a strictly ordered, single-run event sequence into one projection."""
    state: _State | None = None
    session_id: str | None = None
    run_id: str | None = None
    previous_sequence = 0
    user_message_id: str | None = None

    for envelope in events:
        if envelope.sequence <= previous_sequence:
            raise RunReductionError(
                "Run events must have strictly increasing sequences."
            )
        previous_sequence = envelope.sequence
        if envelope.run_id is None:
            raise RunReductionError("Every reduced event must identify its run.")
        if session_id is None:
            session_id = envelope.session_id
            run_id = envelope.run_id
        elif envelope.session_id != session_id or envelope.run_id != run_id:
            raise RunReductionError("Run replay cannot mix sessions or runs.")

        event = _typed_event(envelope)
        if isinstance(event, UserMessageAppendedEvent):
            if user_message_id is not None:
                raise RunReductionError(
                    "A run must contain exactly one user message event."
                )
            user_message_id = event.payload.message_id
            continue
        if isinstance(event, RunCreatedEvent):
            if state is not None:
                raise RunReductionError("A run can only be created once.")
            if user_message_id != event.payload.user_message_id:
                raise RunReductionError("Run creation does not match its user message.")
            limits = event.payload.budget_limits
            state = _State(
                run_id=envelope.run_id,
                session_id=event.session_id,
                user_message_id=event.payload.user_message_id,
                model_snapshot=event.payload.model_snapshot,
                map_snapshot=event.payload.map_snapshot,
                scene_snapshot=event.payload.scene_snapshot,
                limits=limits,
                budget=_Budget(
                    max_model_calls=limits.model_calls,
                    max_tool_calls=limits.tool_calls,
                    max_active_milliseconds=limits.active_milliseconds,
                    max_output_codepoints=limits.output_codepoints,
                ),
                created_at=event.occurred_at,
                created_sequence=envelope.sequence,
                updated_at=event.occurred_at,
                updated_sequence=envelope.sequence,
            )
            continue
        if state is None:
            raise RunReductionError("Run events must follow run.created.")
        if state.state in TERMINAL_RUN_STATES:
            raise RunReductionError(
                f"Terminal run '{state.run_id}' cannot accept more events."
            )

        _apply(state, event, envelope.sequence)
        state.updated_at = event.occurred_at
        state.updated_sequence = envelope.sequence

    if state is None:
        raise RunReductionError("Run replay is missing run.created.")
    if user_message_id != state.user_message_id:
        raise RunReductionError("Run replay is missing its user message event.")
    if not state.selected:
        raise RunReductionError("Run replay is missing run.model_selected.")
    if state.state is RunState.WAITING_CONFIRMATION:
        pending_confirmation_id = state.pending_confirmation_id
        if pending_confirmation_id is None:
            raise RunReductionError(
                "A waiting run must retain its pending confirmation."
            )
        confirmation = state.confirmations.get(pending_confirmation_id)
        if confirmation is None:
            raise RunReductionError("A waiting run references an unknown confirmation.")
        if confirmation.status != "pending":
            raise RunReductionError(
                "A resolved confirmation must commit its tool result or terminal run."
            )
    if state.state is RunState.WAITING_INPUT:
        question = _pending_question(state)
        if question.status != "pending":
            raise RunReductionError(
                "A resolved question must commit its tool result or terminal run."
            )
    return _freeze(state)


def _typed_event(envelope: AgentEvent) -> EventDraft:
    return validate_event_draft(
        {
            "session_id": envelope.session_id,
            "run_id": envelope.run_id,
            "event_type": envelope.event_type,
            "payload": envelope.payload,
            "occurred_at": envelope.occurred_at,
        }
    )


def _apply(state: _State, event: EventDraft, sequence: int) -> None:
    if isinstance(event, RunModelSelectedEvent):
        _select_model(state, event)
    elif not state.selected:
        raise RunReductionError("Operational events require run.model_selected.")
    elif isinstance(event, RunProgressEvent):
        _progress(state, event, sequence)
    elif isinstance(event, BudgetReservedEvent):
        _reserve_budget(state, event)
    elif isinstance(event, BudgetSettledEvent):
        _settle_budget(state, event)
    elif isinstance(event, StepDecisionEvent):
        payload = event.payload
        _validate_start(state, RunState.MODEL_RUNNING, payload.step, payload.attempt, 0)
        if any(item.payload.step == payload.step for item in state.decisions):
            raise RunReductionError("A model step can be admitted only once.")
        if len(payload.input_ids) != len(set(payload.input_ids)) or len(
            payload.messages
        ) != len({item.message_id for item in payload.messages}):
            raise RunReductionError("Step admission requires unique input identities.")
        if payload.kind == "reject" and (payload.messages or not payload.reason):
            raise RunReductionError(
                "Rejected steps require a reason and no admitted messages."
            )
        state.decisions.append(ReducedStepDecision(sequence, payload))
    elif isinstance(event, RequestHeaderEvent):
        payload = event.payload
        if state.state is not RunState.MODEL_RUNNING or (
            payload.step,
            payload.attempt,
        ) != (state.step, state.attempt):
            raise RunReductionError("Request header must match its active attempt.")
        snapshot = payload.model_snapshot
        if (payload.model_id, payload.reasoning_effort, payload.max_output_tokens) != (
            snapshot.model_id,
            snapshot.reasoning_effort,
            snapshot.max_output_tokens,
        ):
            raise RunReductionError(
                "Request configuration must match its logged model snapshot."
            )
        state.request_snapshot = snapshot
        state.admitted_steps.add(payload.step)
    elif isinstance(event, AssistantStartedEvent):
        _start_assistant(state, event, sequence)
    elif isinstance(event, (AssistantDeltaEvent, AssistantReasoningDeltaEvent)):
        _append_delta(state, event, sequence)
    elif isinstance(event, AssistantCompletedEvent):
        _complete_assistant(state, event, sequence)
    elif isinstance(event, ModelAttemptFinishedEvent):
        _finish_model_attempt(state, event, sequence)
    elif isinstance(event, (RetryScheduledEvent, RetryStartedEvent)):
        _retry_boundary(state, event)
    elif isinstance(event, ToolRequestedEvent):
        _request_tool(state, event, sequence)
    elif isinstance(event, ToolProgressEvent):
        _progress_tool(state, event, sequence)
    elif isinstance(event, TodoWriteEvent):
        tool = state.tools.get(event.payload.tool_call_id)
        if (
            state.state is not RunState.TOOL_RUNNING
            or tool is None
            or tool.status != "running"
            or tool.name != "todo_write"
        ):
            raise RunReductionError(
                "Todo snapshot requires its running todo_write call."
            )
        try:
            expected_todos = TODO_LIST_ADAPTER.validate_python(tool.arguments["todos"])
        except (ValueError, KeyError) as error:
            raise RunReductionError("Todo call arguments are invalid.") from error
        if event.payload.todos != expected_todos:
            raise RunReductionError("Todo snapshot differs from the validated call.")
    elif isinstance(event, ToolCompletedEvent):
        _complete_tool(state, event, sequence)
    elif isinstance(event, ToolFailedEvent):
        _fail_tool(state, event, sequence)
    elif isinstance(event, PlanExitSelectedEvent):
        _select_plan_exit(state, event)
    elif isinstance(event, QuestionRequestedEvent):
        _request_question(state, event, sequence)
    elif isinstance(event, QuestionResolvedEvent):
        _resolve_question(state, event, sequence)
    elif isinstance(event, ConfirmationRequestedEvent):
        _request_confirmation(state, event, sequence)
    elif isinstance(event, ConfirmationResolvedEvent):
        _resolve_confirmation(state, event, sequence)
    elif isinstance(event, RunTerminalEvent):
        _finish_run(state, event, sequence)
    else:
        raise RunReductionError(
            f"Event '{event.event_type}' is not valid in a run log."
        )


def _select_model(state: _State, event: RunModelSelectedEvent) -> None:
    if state.selected:
        raise RunReductionError("A run can only select its immutable model once.")
    if (
        event.payload.user_message_id != state.user_message_id
        or event.payload.model_snapshot != state.model_snapshot
        or event.payload.budget_limits != state.limits
    ):
        raise RunReductionError("Selected model or budget differs from run creation.")
    state.selected = True


def _progress(state: _State, event: RunProgressEvent, sequence: int) -> None:
    payload = event.payload
    _require_budget(state, payload.budget)
    phase = ResumePhase(payload.resume_phase)
    if event.event_type == "run.started":
        target = (
            RunState.MODEL_RUNNING
            if phase is ResumePhase.MODEL
            else RunState.TOOL_RUNNING
        )
        _validate_start(
            state, target, payload.step, payload.attempt, payload.next_tool_index
        )
        _transition(state, target)
    elif event.event_type == "run.retried":
        assistant = _attempt_assistant(state, state.step, state.attempt)
        if (
            state.state is not RunState.MODEL_RUNNING
            or state.reservations
            or assistant.model_outcome != "error"
            or assistant.status != "failed"
            or _attempt_tools(state)
            or phase is not ResumePhase.MODEL
            or (payload.step, payload.attempt) != (state.step, state.attempt + 1)
            or payload.next_tool_index != 0
            or payload.requires_resume
            or payload.queue_sequence is not None
        ):
            raise RunReductionError(
                "Retry must follow one settled failed request attempt."
            )
    elif event.event_type == "run.queued":
        if state.state is not RunState.READY or state.requires_resume:
            raise RunReductionError("Only an executable ready run can be queued.")
        if (
            payload.step != state.step
            or payload.attempt != state.attempt
            or phase is not state.resume_phase
            or payload.next_tool_index != state.next_tool_index
        ):
            raise RunReductionError("Queued progress must preserve the run boundary.")
    elif event.event_type == "run.resumed":
        if state.state is RunState.INTERRUPTED:
            if phase is ResumePhase.MODEL:
                if payload.step != state.step or payload.attempt != state.attempt + 1:
                    raise RunReductionError(
                        "A model resume must increment the attempt in place."
                    )
            elif payload.step != state.step or payload.attempt != state.attempt:
                raise RunReductionError("A tool resume must preserve step and attempt.")
        elif state.state is RunState.READY and state.requires_resume:
            if payload.step != state.step or payload.attempt != state.attempt:
                raise RunReductionError("A queued recovery must preserve its progress.")
        else:
            raise RunReductionError(
                "Only interrupted or recovery-required runs can resume."
            )
        _transition(state, RunState.READY)
    elif event.event_type == "run.interrupted":
        if state.state not in {RunState.MODEL_RUNNING, RunState.TOOL_RUNNING}:
            raise RunReductionError("Only active runs can be interrupted.")
        if payload.step != state.step or payload.attempt != state.attempt:
            raise RunReductionError(
                "Interruption progress does not match the active operation."
            )
        _close_reservations(state)
        _settle_streaming_assistants(state, "interrupted", event.occurred_at, sequence)
        for tool in state.tools.values():
            if tool.status in {"pending", "running"}:
                tool.status = "cancelled"
                tool.updated_at = event.occurred_at
                tool.updated_sequence = sequence
        _transition(state, RunState.INTERRUPTED)
    else:
        if state.state is not RunState.READY:
            raise RunReductionError("Recovery markers only apply to ready runs.")
        if payload.step != state.step or payload.attempt != state.attempt:
            raise RunReductionError("Recovery markers must preserve run progress.")
    if (
        event.event_type in {"run.interrupted", "run.recovery_required"}
        and not payload.requires_resume
    ):
        raise RunReductionError(
            "Interrupted or recovered runs must require explicit resume."
        )
    if (
        event.event_type in {"run.started", "run.queued", "run.resumed"}
        and payload.requires_resume
    ):
        raise RunReductionError("Started or resumed runs cannot still require resume.")
    if (
        event.event_type in {"run.queued", "run.resumed"}
        and payload.queue_sequence is None
    ):
        raise RunReductionError("Queued and resumed runs require a queue sequence.")
    if (
        event.event_type
        in {
            "run.started",
            "run.interrupted",
            "run.recovery_required",
        }
        and payload.queue_sequence is not None
    ):
        raise RunReductionError("Non-queued progress cannot retain a queue sequence.")
    state.step = payload.step
    state.attempt = payload.attempt
    state.resume_phase = phase
    state.next_tool_index = payload.next_tool_index
    state.requires_resume = payload.requires_resume
    state.queue_sequence = payload.queue_sequence
    state.pause_reason = payload.reason


def _validate_start(
    state: _State,
    target: RunState,
    step: int,
    attempt: int,
    next_tool_index: int,
) -> None:
    if target is RunState.MODEL_RUNNING:
        if state.state is RunState.READY:
            if state.step == 0:
                expected = (1, 1)
            elif state.resume_phase is ResumePhase.MODEL and _complete_attempt_tools(
                state
            ):
                expected = (state.step + 1, 1)
            else:
                expected = (state.step, state.attempt)
        elif state.state is RunState.TOOL_RUNNING:
            _require_complete_tool_batch(state)
            expected = (state.step + 1, 1)
        elif state.state is RunState.MODEL_RUNNING:
            assistant = _attempt_assistant(state, state.step, state.attempt)
            if (
                assistant.status != "completed"
                or assistant.model_outcome != "stop"
                or _attempt_tools(state)
            ):
                raise RunReductionError(
                    "Steering continuation requires a settled final response."
                )
            expected = (state.step + 1, 1)
        else:
            raise RunReductionError(
                "Model execution cannot start from the current state."
            )
        if (step, attempt) != expected or next_tool_index != 0:
            raise RunReductionError(
                "Model start has invalid step, attempt, or tool cursor."
            )
    else:
        if state.state not in {RunState.READY, RunState.MODEL_RUNNING}:
            raise RunReductionError(
                "Tool execution cannot start from the current state."
            )
        if (step, attempt) != (state.step, state.attempt):
            raise RunReductionError(
                "Tool execution must remain in the current model attempt."
            )
        calls = _attempt_tools(state)
        if not calls or next_tool_index > len(calls):
            raise RunReductionError(
                "Tool execution has no matching complete call batch."
            )


def _reserve_budget(state: _State, event: BudgetReservedEvent) -> None:
    payload = event.payload
    if payload.operation_id in state.operation_ids:
        raise RunReductionError("Budget operation identifiers must be unique.")
    if state.reservations:
        raise RunReductionError("Only one model or tool operation can be active.")
    allowed_states = (
        {RunState.MODEL_RUNNING}
        if payload.operation_type == "model"
        else {
            RunState.TOOL_RUNNING,
            RunState.WAITING_CONFIRMATION,
        }
    )
    if state.state not in allowed_states:
        raise RunReductionError(
            "Budget reservation does not match the active run phase."
        )
    if (
        state.state is RunState.WAITING_CONFIRMATION
        and _approved_pending_confirmation(state) is None
    ):
        raise RunReductionError(
            "A waiting run can only reserve its approved write tool."
        )
    calls = (
        state.budget.model_calls
        if payload.operation_type == "model"
        else state.budget.tool_calls
    )
    maximum = (
        state.budget.max_model_calls
        if payload.operation_type == "model"
        else state.budget.max_tool_calls
    )
    if calls + payload.operation_count > maximum:
        raise RunReductionError("Run call budget is exhausted.")
    if (
        state.budget.active_milliseconds + payload.reserved_milliseconds
        > state.budget.max_active_milliseconds
    ):
        raise RunReductionError("Run active-time budget is exhausted.")
    if payload.operation_type == "model":
        state.budget.model_calls += payload.operation_count
    else:
        state.budget.tool_calls += payload.operation_count
    state.budget.active_milliseconds += payload.reserved_milliseconds
    state.operation_ids.add(payload.operation_id)
    state.reservations[payload.operation_id] = _Reservation(
        operation_type=payload.operation_type,
        operation_count=payload.operation_count,
        reserved_milliseconds=payload.reserved_milliseconds,
    )


def _settle_budget(state: _State, event: BudgetSettledEvent) -> None:
    payload = event.payload
    reservation = state.reservations.pop(payload.operation_id, None)
    if reservation is None:
        raise RunReductionError("Budget settlement has no matching reservation.")
    if (
        reservation.operation_type != payload.operation_type
        or reservation.operation_count != payload.operation_count
        or reservation.reserved_milliseconds != payload.reserved_milliseconds
    ):
        raise RunReductionError("Budget settlement differs from its reservation.")
    if payload.charged_milliseconds > payload.reserved_milliseconds:
        raise RunReductionError("Budget settlement cannot exceed its reservation.")
    if payload.crashed:
        if (
            payload.actual_milliseconds is not None
            or payload.charged_milliseconds != payload.reserved_milliseconds
        ):
            raise RunReductionError(
                "A crashed operation charges its full reserved time."
            )
    elif (
        payload.actual_milliseconds is None
        or payload.charged_milliseconds != payload.actual_milliseconds
    ):
        raise RunReductionError(
            "A completed operation must charge its measured active time."
        )
    state.budget.active_milliseconds += (
        payload.charged_milliseconds - payload.reserved_milliseconds
    )


def _start_assistant(
    state: _State, event: AssistantStartedEvent, sequence: int
) -> None:
    payload = event.payload
    if state.state is not RunState.MODEL_RUNNING:
        raise RunReductionError(
            "Assistant output can only start during model execution."
        )
    _require_reservation(state, "model")
    if (payload.step, payload.attempt) != (state.step, state.attempt):
        raise RunReductionError(
            "Assistant attempt does not match current run progress."
        )
    if payload.message_id in state.assistants:
        raise RunReductionError("Assistant message identifiers must be unique.")
    if any(
        item.step == payload.step and item.attempt == payload.attempt
        for item in state.assistants.values()
    ):
        raise RunReductionError("A model attempt can only own one assistant message.")
    state.assistants[payload.message_id] = _Assistant(
        message_id=payload.message_id,
        source_model=(
            state.model_snapshot
            if state.request_snapshot is None
            else state.request_snapshot
        ).model_id,
        step=payload.step,
        attempt=payload.attempt,
        created_at=event.occurred_at,
        created_sequence=sequence,
        updated_at=event.occurred_at,
        updated_sequence=sequence,
    )


def _append_delta(
    state: _State,
    event: AssistantDeltaEvent | AssistantReasoningDeltaEvent,
    sequence: int,
) -> None:
    assistant = _assistant(state, event.payload.message_id)
    payload = event.payload
    _require_attempt(assistant, payload.step, payload.attempt)
    reasoning = isinstance(event, AssistantReasoningDeltaEvent)
    content = assistant.reasoning_content if reasoning else assistant.content
    if (
        assistant.status != "streaming"
        or payload.offset != len(content)
        or not payload.text
    ):
        raise RunReductionError(
            "Assistant delta does not continue its codepoint offset."
        )
    if (
        state.budget.output_codepoints + len(payload.text)
        > state.budget.max_output_codepoints
    ):
        raise RunReductionError("Run output budget is exhausted.")
    if reasoning:
        assistant.reasoning_content += payload.text
    else:
        assistant.content += payload.text
    block_type = ReasoningBlock if reasoning else TextBlock
    if assistant.blocks and isinstance(assistant.blocks[-1], block_type):
        previous = assistant.blocks[-1]
        assistant.blocks = (
            *assistant.blocks[:-1],
            block_type(text=previous.text + payload.text),
        )
    else:
        assistant.blocks = (*assistant.blocks, block_type(text=payload.text))
    assistant.updated_at = event.occurred_at
    assistant.updated_sequence = sequence
    state.budget.output_codepoints += len(payload.text)


def _complete_assistant(
    state: _State, event: AssistantCompletedEvent, sequence: int
) -> None:
    assistant = _assistant(state, event.payload.message_id)
    payload = event.payload
    _require_attempt(assistant, payload.step, payload.attempt)
    if assistant.status != "streaming" or payload.content_length != len(
        assistant.content
    ):
        raise RunReductionError("Assistant completion does not match durable content.")
    if payload.finish_reason == "stop" and not assistant.content:
        raise RunReductionError(
            "A normal assistant completion must contain visible text."
        )
    assistant.status = "completed"
    assistant.finish_reason = payload.finish_reason
    assistant.updated_at = event.occurred_at
    assistant.updated_sequence = sequence


def _finish_model_attempt(
    state: _State, event: ModelAttemptFinishedEvent, sequence: int
) -> None:
    payload = event.payload
    if state.state is not RunState.MODEL_RUNNING:
        raise RunReductionError("Model outcomes require active model execution.")
    if state.reservations:
        raise RunReductionError("Model outcomes require a settled budget reservation.")
    assistant = _attempt_assistant(state, payload.step, payload.attempt)
    if assistant.model_outcome is not None:
        raise RunReductionError("A model attempt can only finish once.")
    if payload.message_id != assistant.message_id:
        raise RunReductionError(
            "Attempt settlement must identify its assistant message."
        )
    assembler = BlockAssembler()
    observed: dict[tuple[str, int], list[str]] = {}
    delivered: dict[str, list[str]] = {"text": [], "reasoning": []}
    outputs = expand_assistant_stream(payload.stream)
    for position, timed in enumerate(outputs):
        output = timed.output
        try:
            accepted = assembler.push(output)
        except (TypeError, ValueError) as error:
            if not (
                payload.outcome == "error"
                and payload.error_code == "PROVIDER_PROTOCOL"
                and position == len(outputs) - 1
            ):
                raise RunReductionError("Invalid model block stream.") from error
            break
        if not accepted:
            continue
        if isinstance(output, (TextDelta, ReasoningDelta)):
            kind = "reasoning" if isinstance(output, ReasoningDelta) else "text"
            observed.setdefault((kind, output.index), []).append(output.text)
            delivered[kind].append(output.text)
        elif isinstance(output, BlockEnd) and isinstance(
            output.block, (TextBlock, ReasoningBlock)
        ):
            if not "".join(observed.get((output.block.type, output.index), [])):
                delivered[output.block.type].append(output.block.text)
    text, reasoning = "".join(delivered["text"]), "".join(delivered["reasoning"])
    valid_prefix = (
        text.startswith(assistant.content)
        and reasoning.startswith(assistant.reasoning_content)
        if payload.error_code == "OUTPUT_LIMIT"
        else (text, reasoning) == (assistant.content, assistant.reasoning_content)
    )
    if not valid_prefix:
        raise RunReductionError(
            "Attempt stream does not match the delivered assistant prefix."
        )
    interrupted = (
        payload.outcome not in {"stop", "tool_calls", "length"}
        or payload.error_code == "OUTPUT_LIMIT"
    )
    limit = (
        state.budget.max_output_codepoints
        - state.budget.output_codepoints
        + len(assistant.content)
        + len(assistant.reasoning_content)
    )
    if assembler.output_codepoints > limit and payload.error_code != "OUTPUT_LIMIT":
        raise RunReductionError(
            "Canonical model content exceeds the remaining output budget."
        )
    try:
        expected = assembler.blocks(interrupted=interrupted, output_limit=limit)
    except ValueError as error:
        raise RunReductionError("Incomplete canonical model blocks.") from error
    # Buffered provenance represents historical journal facts, including tool calls
    # recorded separately. It never claims native chunk timing for those calls.
    actual = (
        payload.blocks
        if payload.stream_origin == "model"
        else tuple(
            block for block in payload.blocks if not isinstance(block, ToolCallBlock)
        )
    )
    if actual != expected or payload.replay_state != (
        None if interrupted else assembler.replay_state
    ):
        raise RunReductionError(
            "Attempt content or replay metadata differs from its stream."
        )
    if payload.stream_origin == "model":
        usage = [
            record.chunk
            for record in payload.stream
            if isinstance(record, RawChunk) and isinstance(record.chunk, UsageChunk)
        ]
        if (
            len(usage) > 1
            and payload.outcome != "error"
            or not usage
            and any(
                value is not None
                for value in (
                    payload.input_tokens,
                    payload.output_tokens,
                    payload.total_tokens,
                )
            )
            or usage
            and (usage[0].input_tokens, usage[0].output_tokens, usage[0].total_tokens)
            != (payload.input_tokens, payload.output_tokens, payload.total_tokens)
        ):
            raise RunReductionError("Attempt accounting must match its stream usage.")
        finishes = [
            record.chunk.reason.value
            for record in payload.stream
            if isinstance(record, RawChunk) and isinstance(record.chunk, FinishChunk)
        ]
        if (
            payload.outcome in {"stop", "tool_calls", "content_filter"}
            or payload.outcome == "length"
            and payload.error_code != "OUTPUT_LIMIT"
        ) and finishes != [payload.outcome]:
            raise RunReductionError("Attempt outcome must match its stream finish.")
    if payload.outcome in {"stop", "tool_calls"}:
        if (
            assistant.status != "completed"
            or assistant.finish_reason != payload.outcome
        ):
            raise RunReductionError(
                "Model outcome does not match assistant completion."
            )
        if payload.error_code is not None:
            raise RunReductionError(
                "Successful model outcomes cannot carry an error code."
            )
    elif not payload.error_code:
        raise RunReductionError(
            "Unsuccessful model outcomes require a stable error code."
        )
    if payload.cumulative_active_milliseconds != state.budget.active_milliseconds:
        raise RunReductionError(
            "Model outcome active time differs from the run budget."
        )
    # Provider closure may replace a short preview with longer final content.
    # Charge the larger of the accepted delivery and final representation, so
    # normalization cannot refund generation or grant extra next-step capacity.
    delivered_codepoints = len(assistant.content) + len(assistant.reasoning_content)
    final_codepoints = content_codepoints(payload.blocks)
    state.budget.output_codepoints += max(0, final_codepoints - delivered_codepoints)
    assistant.blocks = payload.blocks
    assistant.replay_state = payload.replay_state
    assistant.content = content_text(payload.blocks)
    assistant.reasoning_content = content_text(payload.blocks, reasoning=True)
    assistant.model_outcome = payload.outcome
    if payload.outcome in {"error", "length", "content_filter"}:
        assistant.status = "failed"
    assistant.updated_at = event.occurred_at
    assistant.updated_sequence = sequence
    state.budget.input_tokens = _add_known(
        state.budget.input_tokens, payload.input_tokens
    )
    state.budget.output_tokens = _add_known(
        state.budget.output_tokens, payload.output_tokens
    )
    state.budget.total_tokens = _add_known(
        state.budget.total_tokens, payload.total_tokens
    )


def _request_tool(state: _State, event: ToolRequestedEvent, sequence: int) -> None:
    payload = event.payload
    if state.state is not RunState.MODEL_RUNNING:
        raise RunReductionError("Tool calls can only be registered from model output.")
    assistant = _attempt_assistant(state, payload.step, payload.attempt)
    if (
        assistant.message_id != payload.message_id
        or assistant.status != "completed"
        or assistant.finish_reason != "tool_calls"
        or assistant.model_outcome != "tool_calls"
    ):
        raise RunReductionError(
            "Tool request is not paired with a completed tool-call response."
        )
    if payload.tool_call_id in state.tools:
        raise RunReductionError("Tool call identifiers must be globally unique.")
    calls = _attempt_tools(state)
    if payload.batch_index != len(calls):
        raise RunReductionError("Tool call batch indexes must be contiguous from zero.")
    if any(item.provider_call_id == payload.provider_call_id for item in calls):
        raise RunReductionError(
            "Provider tool call identifiers must be unique per attempt."
        )
    blocks = tuple(
        block for block in assistant.blocks if isinstance(block, ToolCallBlock)
    )
    if payload.batch_index >= len(blocks):
        raise RunReductionError("Tool request has no canonical model block.")
    block = blocks[payload.batch_index]
    if (block.id, block.name, json.loads(block.arguments)) != (
        payload.provider_call_id,
        payload.name,
        payload.arguments,
    ):
        raise RunReductionError("Tool request differs from its canonical model block.")
    state.tools[payload.tool_call_id] = _ToolCall(
        tool_call_id=payload.tool_call_id,
        provider_call_id=payload.provider_call_id,
        message_id=payload.message_id,
        step=payload.step,
        attempt=payload.attempt,
        batch_index=payload.batch_index,
        name=payload.name,
        arguments=payload.arguments,
        execution=payload.execution,
        created_at=event.occurred_at,
        created_sequence=sequence,
        updated_at=event.occurred_at,
        updated_sequence=sequence,
    )


def _progress_tool(state: _State, event: ToolProgressEvent, sequence: int) -> None:
    tool = _tool(state, event.payload.tool_call_id)
    _require_tool_payload(tool, event.payload)
    if event.event_type == "tool.started":
        approved = _approved_pending_confirmation(state)
        if (
            state.state
            not in {
                RunState.TOOL_RUNNING,
                RunState.WAITING_CONFIRMATION,
            }
            or tool.status not in {"pending", "cancelled"}
            or (
                state.state is RunState.WAITING_CONFIRMATION
                and (approved is None or approved.tool_call_id != tool.tool_call_id)
            )
        ):
            raise RunReductionError("Only the current pending tool can start.")
        _require_reservation(state, "tool")
        reservation = next(iter(state.reservations.values()))
        calls = _attempt_tools(state)
        parallel_start = (
            tool.execution == "parallel"
            and reservation.operation_count > 1
            and tool.batch_index >= state.next_tool_index
            and all(
                item.status == "running" and item.execution == "parallel"
                for item in calls[state.next_tool_index : tool.batch_index]
            )
            and sum(item.status == "running" for item in calls)
            < reservation.operation_count
        )
        if event.payload.next_tool_index != state.next_tool_index or (
            tool.batch_index != state.next_tool_index and not parallel_start
        ):
            raise RunReductionError(
                "Tool start does not match the durable batch cursor."
            )
        tool.status = "running"
    else:
        if (
            state.state is not RunState.TOOL_RUNNING
            or tool.status not in {"pending", "running"}
            or tool.batch_index != state.next_tool_index
            or event.payload.next_tool_index != state.next_tool_index
        ):
            raise RunReductionError("Only unfinished tools can be cancelled.")
        tool.status = "cancelled"
        state.next_tool_index = event.payload.next_tool_index
    tool.updated_at = event.occurred_at
    tool.updated_sequence = sequence


def _complete_tool(state: _State, event: ToolCompletedEvent, sequence: int) -> None:
    tool = _tool(state, event.payload.tool_call_id)
    _require_tool_payload(tool, event.payload)
    _finish_tool_cursor(state, tool, event.payload.next_tool_index)
    tool.status = "completed"
    tool.result = event.payload.result
    tool.content = event.payload.content
    tool.updated_at = event.occurred_at
    tool.updated_sequence = sequence
    if state.state is RunState.WAITING_INPUT:
        _finish_question_tool(state, tool)
    if state.state is RunState.WAITING_CONFIRMATION:
        approved = _approved_pending_confirmation(state)
        if approved is None or approved.tool_call_id != tool.tool_call_id:
            raise RunReductionError(
                "A waiting write tool requires its exact approved confirmation."
            )
        state.pending_confirmation_id = None
        state.pending_confirmation_tool_id = None
        state.pause_reason = None
        state.resume_phase = (
            ResumePhase.TOOL
            if state.next_tool_index < len(_attempt_tools(state))
            else ResumePhase.MODEL
        )
        state.requires_resume = False
        state.queue_sequence = None
        _transition(state, RunState.READY)


def _fail_tool(state: _State, event: ToolFailedEvent, sequence: int) -> None:
    tool = _tool(state, event.payload.tool_call_id)
    _require_tool_payload(tool, event.payload)
    _finish_tool_cursor(state, tool, event.payload.next_tool_index)
    tool.status = "failed"
    tool.error_code = event.payload.error_code
    tool.error_summary = event.payload.error_summary
    tool.updated_at = event.occurred_at
    tool.updated_sequence = sequence
    if state.state is RunState.WAITING_INPUT:
        _finish_question_tool(state, tool)


def _finish_tool_cursor(state: _State, tool: _ToolCall, next_tool_index: int) -> None:
    if (
        state.state
        not in {
            RunState.TOOL_RUNNING,
            RunState.WAITING_CONFIRMATION,
            RunState.WAITING_INPUT,
        }
        or tool.status != "running"
    ):
        raise RunReductionError("Only a running tool can produce a result.")
    if (
        tool.batch_index != state.next_tool_index
        or next_tool_index != tool.batch_index + 1
    ):
        raise RunReductionError(
            "Tool result must advance the durable batch cursor once."
        )
    state.next_tool_index = next_tool_index


def _require_reservation(
    state: _State, operation_type: Literal["model", "tool"]
) -> None:
    if len(state.reservations) != 1:
        raise RunReductionError("Execution requires one active budget reservation.")
    reservation = next(iter(state.reservations.values()))
    if reservation.operation_type != operation_type:
        raise RunReductionError("Budget reservation does not match the execution type.")


def _pending_question(state: _State) -> ReducedQuestion:
    question = state.questions.get(state.pending_question_id)
    if question is None:
        raise RunReductionError("Waiting input requires its exact question.")
    return question


def _request_question(
    state: _State, event: QuestionRequestedEvent, sequence: int
) -> None:
    payload = event.payload
    tool = _tool(state, payload.tool_call_id)
    if (
        state.state is not RunState.TOOL_RUNNING
        or state.reservations
        or state.pending_question_id is not None
        or tool.status != "running"
        or tool.execution != "exclusive"
        or tool.batch_index != state.next_tool_index
        or payload.question_id in state.questions
        or (tool.step, tool.attempt) != (state.step, state.attempt)
    ):
        raise RunReductionError(
            "Human question must own the current started exclusive tool."
        )
    state.questions[payload.question_id] = ReducedQuestion(
        question_id=payload.question_id,
        tool_call_id=payload.tool_call_id,
        request=payload.request,
        status="pending",
        answer=None,
        created_at=event.occurred_at,
        updated_at=event.occurred_at,
        created_sequence=sequence,
        updated_sequence=sequence,
    )
    state.pending_question_id = payload.question_id
    state.pause_reason = "Waiting for the user's answer."
    state.queue_sequence = None
    _transition(state, RunState.WAITING_INPUT)


def _resolve_question(
    state: _State, event: QuestionResolvedEvent, sequence: int
) -> None:
    question = _pending_question(state)
    payload = event.payload
    if (
        state.state is not RunState.WAITING_INPUT
        or question.question_id != payload.question_id
        or question.status != "pending"
    ):
        raise RunReductionError("Human decision must own the pending question exactly.")
    answer = payload.answer
    if answer is not None:
        try:
            normalized = answer.for_questions(question.request)
        except ValueError as error:
            raise RunReductionError(str(error)) from error
        if normalized != answer:
            raise RunReductionError("Question answer must be canonical.")
    state.questions[question.question_id] = replace(
        question,
        status=payload.decision,
        answer=answer,
        updated_at=event.occurred_at,
        updated_sequence=sequence,
    )


def _select_plan_exit(state: _State, event: PlanExitSelectedEvent) -> None:
    question = _pending_question(state)
    tool = _tool(state, event.payload.tool_call_id)
    items = question.request.questions
    answer = question.answer
    if (
        state.state is not RunState.WAITING_INPUT
        or question.status != "answered"
        or tool.tool_call_id != question.tool_call_id
        or tool.name != "exit_plan_mode"
        or tool.tool_call_id in state.plan_exit_selections
        or len(items) != 1
        or items[0].intent is None
        or items[0].intent.kind != "plan-review"
        or items[0].intent.call_id != tool.tool_call_id
        or items[0].detail != tool.arguments.get("plan")
        or answer is None
        or len(answer.answers) != 1
        or answer.answers[0].id != items[0].id
        or answer.answers[0].selected != (items[0].intent.approve,)
        or answer.answers[0].custom is not None
    ):
        raise RunReductionError("Plan exit must own one exact approved plan review.")
    state.plan_exit_selections.add(tool.tool_call_id)


def _finish_question_tool(state: _State, tool: _ToolCall) -> None:
    question = _pending_question(state)
    if question.tool_call_id != tool.tool_call_id or question.status not in {
        "answered",
        "dismissed",
    }:
        raise RunReductionError("Tool settlement requires its resolved human question.")
    if (
        tool.name == "exit_plan_mode"
        and tool.status == "completed"
        and (
            tool.tool_call_id not in state.plan_exit_selections
            or not isinstance(tool.result, dict)
            or set(tool.result) != {"approved"}
            or tool.result["approved"] is not True
        )
    ):
        raise RunReductionError(
            "Completed plan exit requires its approved selection and result."
        )
    if tool.status == "failed" and tool.tool_call_id in state.plan_exit_selections:
        raise RunReductionError("An approved plan exit cannot settle as failed.")
    state.pending_question_id = None
    state.pause_reason = None
    state.resume_phase = (
        ResumePhase.TOOL
        if state.next_tool_index < len(_attempt_tools(state))
        else ResumePhase.MODEL
    )
    state.requires_resume = False
    state.queue_sequence = None
    _transition(state, RunState.READY)


def _request_confirmation(
    state: _State, event: ConfirmationRequestedEvent, sequence: int
) -> None:
    payload = event.payload
    if (
        state.state is not RunState.TOOL_RUNNING
        or state.pending_confirmation_id is not None
        or state.reservations
    ):
        raise RunReductionError(
            "Confirmation requires an active tool and no pending decision."
        )
    tool = _tool(state, payload.tool_call_id)
    if (
        tool.status != "pending"
        or tool.batch_index != state.next_tool_index
        or tool.name != payload.name
        or tool.arguments != payload.arguments
        or state.map_snapshot.get("workspace_id") != payload.workspace_id
    ):
        raise RunReductionError(
            "Confirmation snapshot differs from the pending tool call."
        )
    if payload.confirmation_id in state.confirmations or any(
        item.tool_call_id == payload.tool_call_id
        for item in state.confirmations.values()
    ):
        raise RunReductionError("A tool call can only own one confirmation.")
    state.confirmations[payload.confirmation_id] = _Confirmation(
        confirmation_id=payload.confirmation_id,
        tool_call_id=payload.tool_call_id,
        workspace_id=payload.workspace_id,
        name=payload.name,
        arguments=payload.arguments,
        summary=payload.summary,
        side_effect=payload.side_effect,
        execution=payload.execution,
        binding=payload.binding,
        created_at=event.occurred_at,
        created_sequence=sequence,
        updated_at=event.occurred_at,
        updated_sequence=sequence,
    )
    _transition(state, RunState.WAITING_CONFIRMATION)
    state.pending_confirmation_id = payload.confirmation_id
    state.pending_confirmation_tool_id = payload.tool_call_id
    state.pause_reason = payload.summary
    state.queue_sequence = None


def _resolve_confirmation(
    state: _State, event: ConfirmationResolvedEvent, sequence: int
) -> None:
    payload = event.payload
    if (
        state.state is not RunState.WAITING_CONFIRMATION
        or state.pending_confirmation_id != payload.confirmation_id
        or state.pending_confirmation_tool_id != payload.tool_call_id
    ):
        raise RunReductionError(
            "Confirmation resolution does not match the pending snapshot."
        )
    confirmation = state.confirmations.get(payload.confirmation_id)
    if confirmation is None or confirmation.status != "pending":
        raise RunReductionError("Confirmation can only be resolved once.")
    confirmation.status = payload.decision
    confirmation.decided_at = payload.decided_at
    confirmation.updated_at = event.occurred_at
    confirmation.updated_sequence = sequence
    state.requires_resume = False
    if payload.decision == "approved" and confirmation.execution == "tool":
        if confirmation.binding is None:
            raise RunReductionError(
                "Deferred approval requires its exact tool binding."
            )
        state.pending_confirmation_id = None
        state.pending_confirmation_tool_id = None
        state.pause_reason = None
        state.resume_phase = ResumePhase.TOOL
        state.queue_sequence = None
        _transition(state, RunState.READY)


def _retry_boundary(
    state: _State, event: RetryScheduledEvent | RetryStartedEvent
) -> None:
    payload = event.payload
    if state.state is not RunState.MODEL_RUNNING or (payload.step, payload.attempt) != (
        state.step,
        state.attempt,
    ):
        raise RunReductionError(
            "Retry must belong to the current failed model attempt."
        )
    assistant = _attempt_assistant(state, state.step, state.attempt)
    if assistant.status != "failed" or assistant.model_outcome != "error":
        raise RunReductionError("Retry requires a durably settled request failure.")
    key = (payload.retry_id, payload.retry)
    if isinstance(event, RetryScheduledEvent):
        config = state.request_snapshot
        if config is None:
            raise RunReductionError("Retry requires the actual request configuration.")
        policy = config.retry_policy
        if (
            payload.provider != config.connection_id
            or payload.policy_key != retry_policy_key(policy)
            or payload.mode != policy.mode
            or payload.max_retries
            != (policy.max_retries if isinstance(policy, NormalRetryPolicy) else None)
            or payload.delay_ms > policy.max_delay_ms
        ):
            raise RunReductionError(
                "Retry must match the failed request's provider policy."
            )
        previous = [
            plan
            for plan in state.retry_plans
            if (plan.step, plan.provider, plan.policy_key)
            == (payload.step, payload.provider, payload.policy_key)
        ]
        expected = previous[-1].retry + 1 if previous else 1
        if payload.retry != expected or (
            previous and payload.retry_id != previous[-1].retry_id
        ):
            raise RunReductionError(
                "Retry numbering and identity must continue the current provider policy."
            )
        if any(
            (plan.step, plan.attempt) == (payload.step, payload.attempt)
            for plan in state.retry_plans
        ):
            raise RunReductionError("A failed attempt may schedule only one retry.")
        state.retry_plans.append(payload)
    else:
        plan = next(
            (plan for plan in state.retry_plans if (plan.retry_id, plan.retry) == key),
            None,
        )
        if (
            plan is None
            or (plan.step, plan.attempt) != (payload.step, payload.attempt)
            or key in state.started_retries
        ):
            raise RunReductionError("Retry start must identify one unstarted plan.")
        state.started_retries.add(key)


def _finish_run(state: _State, event: RunTerminalEvent, sequence: int) -> None:
    payload = event.payload
    target = RunState(payload.state)
    _require_budget(state, payload.budget)
    empty_initial_step = (
        state.state is RunState.READY
        and state.step == 0
        and state.decisions
        and state.decisions[-1].payload.kind == "enter"
        and not state.decisions[-1].payload.messages
        and state.budget.model_calls == 0
    )
    if target is RunState.COMPLETED and not empty_initial_step:
        assistant = _attempt_assistant(state, state.step, state.attempt)
        if assistant.status != "completed" or assistant.model_outcome != "stop":
            raise RunReductionError(
                "A completed run requires a normal final assistant response."
            )
        if state.reservations:
            raise RunReductionError(
                "A completed run cannot retain budget reservations."
            )
        _require_complete_tool_history(state)
    else:
        _close_reservations(state)
    _transition(state, target)
    settled_status: AssistantStatus = (
        "failed" if target is RunState.FAILED else "cancelled"
    )
    _settle_streaming_assistants(state, settled_status, event.occurred_at, sequence)
    for tool in state.tools.values():
        if tool.status in {"pending", "running"}:
            tool.status = "failed" if target is RunState.FAILED else "cancelled"
            tool.error_code = "RUN_FAILED" if target is RunState.FAILED else None
            tool.error_summary = payload.reason if target is RunState.FAILED else None
            tool.updated_at = event.occurred_at
            tool.updated_sequence = sequence
    for identity, question in tuple(state.questions.items()):
        if question.status == "pending":
            state.questions[identity] = replace(
                question,
                status="cancelled",
                updated_at=event.occurred_at,
                updated_sequence=sequence,
            )
    state.pending_question_id = None
    state.pending_confirmation_id = None
    state.pending_confirmation_tool_id = None
    state.requires_resume = False
    state.queue_sequence = None
    state.pause_reason = payload.reason


def _transition(state: _State, target: RunState) -> None:
    if target not in ALLOWED_RUN_TRANSITIONS[state.state]:
        raise RunReductionError(
            f"Run state transition '{state.state.value}' -> '{target.value}' is invalid."
        )
    state.state = target


def _assistant(state: _State, message_id: str) -> _Assistant:
    assistant = state.assistants.get(message_id)
    if assistant is None:
        raise RunReductionError(f"Assistant message '{message_id}' was not started.")
    return assistant


def _attempt_assistant(state: _State, step: int, attempt: int) -> _Assistant:
    matches = [
        item
        for item in state.assistants.values()
        if item.step == step and item.attempt == attempt
    ]
    if len(matches) != 1:
        raise RunReductionError(
            "The current model attempt has no unique assistant message."
        )
    return matches[0]


def _require_attempt(assistant: _Assistant, step: int, attempt: int) -> None:
    if (assistant.step, assistant.attempt) != (step, attempt):
        raise RunReductionError(
            "Assistant event step or attempt does not match its message."
        )


def _tool(state: _State, tool_call_id: str) -> _ToolCall:
    tool = state.tools.get(tool_call_id)
    if tool is None:
        raise RunReductionError(f"Tool call '{tool_call_id}' was not requested.")
    return tool


class _ToolEventPayload(Protocol):
    provider_call_id: str
    message_id: str
    batch_index: int


def _require_tool_payload(tool: _ToolCall, payload: _ToolEventPayload) -> None:
    if (
        payload.provider_call_id != tool.provider_call_id
        or payload.message_id != tool.message_id
        or payload.batch_index != tool.batch_index
    ):
        raise RunReductionError("Tool event does not match its requested call.")


def _attempt_tools(state: _State) -> list[_ToolCall]:
    return sorted(
        (
            item
            for item in state.tools.values()
            if item.step == state.step and item.attempt == state.attempt
        ),
        key=lambda item: item.batch_index,
    )


def _approved_pending_confirmation(state: _State) -> _Confirmation | None:
    if state.pending_confirmation_id is None:
        return None
    confirmation = state.confirmations.get(state.pending_confirmation_id)
    if confirmation is None or confirmation.status != "approved":
        return None
    return confirmation


def _require_complete_tool_batch(state: _State) -> None:
    calls = _attempt_tools(state)
    if not calls or state.next_tool_index != len(calls):
        raise RunReductionError("The current tool batch is not fully consumed.")
    if any(item.status not in {"completed", "failed"} for item in calls):
        raise RunReductionError(
            "Only a fully settled tool batch can advance the model step."
        )


def _complete_attempt_tools(state: _State) -> bool:
    calls = _attempt_tools(state)
    return (
        bool(calls)
        and state.next_tool_index == len(calls)
        and all(item.status in {"completed", "failed"} for item in calls)
    )


def _require_complete_tool_history(state: _State) -> None:
    if any(item.status not in {"completed", "failed"} for item in state.tools.values()):
        raise RunReductionError("A completed run cannot contain unfinished tool calls.")


def _require_budget(state: _State, payload: BudgetUsagePayload) -> None:
    budget = state.budget
    actual = (
        budget.model_calls,
        budget.tool_calls,
        budget.active_milliseconds,
        budget.output_codepoints,
        budget.input_tokens,
        budget.output_tokens,
        budget.total_tokens,
    )
    expected = (
        payload.model_calls,
        payload.tool_calls,
        payload.active_milliseconds,
        payload.output_codepoints,
        payload.input_tokens,
        payload.output_tokens,
        payload.total_tokens,
    )
    if actual != expected:
        raise RunReductionError("Event budget snapshot differs from reduced usage.")


def _add_known(current: int | None, addition: int | None) -> int | None:
    if addition is None:
        return current
    return (current or 0) + addition


def _close_reservations(state: _State) -> None:
    state.reservations.clear()


def _settle_streaming_assistants(
    state: _State,
    status: AssistantStatus,
    occurred_at: datetime,
    sequence: int,
) -> None:
    for assistant in state.assistants.values():
        if assistant.status == "streaming":
            assistant.status = status
            assistant.updated_at = occurred_at
            assistant.updated_sequence = sequence


def _freeze(state: _State) -> ReducedRun:
    budget = state.budget
    return ReducedRun(
        run_id=state.run_id,
        session_id=state.session_id,
        user_message_id=state.user_message_id,
        state=state.state,
        step=state.step,
        attempt=state.attempt,
        resume_phase=state.resume_phase,
        next_tool_index=state.next_tool_index,
        requires_resume=state.requires_resume,
        queue_sequence=state.queue_sequence,
        pending_confirmation_id=state.pending_confirmation_id,
        pending_question_id=state.pending_question_id,
        questions=tuple(state.questions.values()),
        pause_reason=state.pause_reason,
        model_snapshot=state.model_snapshot,
        request_snapshot=state.request_snapshot,
        admitted_steps=frozenset(state.admitted_steps),
        decisions=tuple(state.decisions),
        map_snapshot=state.map_snapshot,
        scene_snapshot=state.scene_snapshot,
        budget=ReducedBudget(
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
        assistants=tuple(
            ReducedAssistant(
                message_id=item.message_id,
                source_model=item.source_model,
                step=item.step,
                attempt=item.attempt,
                content=item.content,
                reasoning_content=item.reasoning_content,
                blocks=item.blocks,
                replay_state=item.replay_state,
                status=item.status,
                finish_reason=item.finish_reason,
                created_at=item.created_at,
                updated_at=item.updated_at or item.created_at,
                created_sequence=item.created_sequence,
                updated_sequence=item.updated_sequence,
            )
            for item in sorted(
                state.assistants.values(), key=lambda value: value.created_sequence
            )
        ),
        tool_calls=tuple(
            ReducedToolCall(
                tool_call_id=item.tool_call_id,
                provider_call_id=item.provider_call_id,
                message_id=item.message_id,
                step=item.step,
                attempt=item.attempt,
                batch_index=item.batch_index,
                name=item.name,
                arguments=item.arguments,
                status=item.status,
                result=item.result,
                content=item.content,
                error_code=item.error_code,
                error_summary=item.error_summary,
                created_at=item.created_at,
                updated_at=item.updated_at or item.created_at,
                created_sequence=item.created_sequence,
                updated_sequence=item.updated_sequence,
            )
            for item in sorted(
                state.tools.values(), key=lambda value: value.created_sequence
            )
        ),
        confirmations=tuple(
            ReducedConfirmation(
                confirmation_id=item.confirmation_id,
                tool_call_id=item.tool_call_id,
                workspace_id=item.workspace_id,
                name=item.name,
                arguments=item.arguments,
                summary=item.summary,
                side_effect=item.side_effect,
                execution=item.execution,
                binding=item.binding,
                status=item.status,
                decided_at=item.decided_at,
                created_at=item.created_at,
                updated_at=item.updated_at or item.created_at,
                created_sequence=item.created_sequence,
                updated_sequence=item.updated_sequence,
            )
            for item in sorted(
                state.confirmations.values(),
                key=lambda value: value.created_sequence,
            )
        ),
        created_at=state.created_at,
        updated_at=state.updated_at,
        created_sequence=state.created_sequence,
        updated_sequence=state.updated_sequence,
    )
