"""Run projection tools; derived exclusively from committed events."""

import json

from kunyu.agent.runtime.contracts.content import ToolCallBlock
from kunyu.agent.runtime.events.base import ResumePhase, RunState
from kunyu.agent.runtime.events.tools import (
    ToolCompletedEvent,
    ToolFailedEvent,
    ToolProgressEvent,
    ToolRequestedEvent,
)
from kunyu.agent.runtime.projection.run.guards import (
    _approved_pending_confirmation,
    _attempt_assistant,
    _attempt_tools,
    _require_reservation,
    _require_tool_payload,
    _tool,
    _transition,
)
from kunyu.agent.runtime.projection.run.interactions import _finish_question_tool
from kunyu.agent.runtime.projection.run_state import (
    RunReductionError,
    _State,
    _ToolCall,
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
