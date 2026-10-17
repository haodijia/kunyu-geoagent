"""Run projection interactions; derived exclusively from committed events."""

from dataclasses import replace

from kunyu.agent.runtime.events.base import ResumePhase, RunState
from kunyu.agent.runtime.events.tools import (
    ConfirmationRequestedEvent,
    ConfirmationResolvedEvent,
    PlanExitSelectedEvent,
    QuestionRequestedEvent,
    QuestionResolvedEvent,
)
from kunyu.agent.runtime.projection.run.guards import (
    _attempt_tools,
    _pending_question,
    _tool,
    _transition,
)
from kunyu.agent.runtime.projection.run_state import (
    ReducedQuestion,
    RunReductionError,
    _Confirmation,
    _State,
    _ToolCall,
)


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
