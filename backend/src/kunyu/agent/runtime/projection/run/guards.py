"""Run projection guards; derived exclusively from committed events."""

from datetime import datetime
from typing import Literal, Protocol

from kunyu.agent.runtime.events.base import ALLOWED_RUN_TRANSITIONS, RunState
from kunyu.agent.runtime.projection.run_state import (
    AssistantStatus,
    ReducedQuestion,
    RunReductionError,
    _Assistant,
    _Confirmation,
    _State,
    _ToolCall,
)


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
