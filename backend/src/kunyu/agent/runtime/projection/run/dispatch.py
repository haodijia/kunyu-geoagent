"""Run projection dispatch; derived exclusively from committed events."""

from kunyu.agent.runtime.contracts.todos import TODO_LIST_ADAPTER
from kunyu.agent.runtime.events.assistant import (
    AssistantCompletedEvent,
    AssistantDeltaEvent,
    AssistantReasoningDeltaEvent,
    AssistantStartedEvent,
    ModelAttemptFinishedEvent,
    RequestHeaderEvent,
    StepDecisionEvent,
)
from kunyu.agent.runtime.events.base import RunState
from kunyu.agent.runtime.events.run import (
    BudgetReservedEvent,
    BudgetSettledEvent,
    RetryScheduledEvent,
    RetryStartedEvent,
    RunModelSelectedEvent,
    RunProgressEvent,
    RunTerminalEvent,
)
from kunyu.agent.runtime.events.store import EventDraft
from kunyu.agent.runtime.events.tools import (
    ConfirmationRequestedEvent,
    ConfirmationResolvedEvent,
    PlanExitSelectedEvent,
    QuestionRequestedEvent,
    QuestionResolvedEvent,
    TodoWriteEvent,
    ToolCompletedEvent,
    ToolFailedEvent,
    ToolProgressEvent,
    ToolRequestedEvent,
)
from kunyu.agent.runtime.projection.run.assistant import (
    _append_delta,
    _complete_assistant,
    _finish_model_attempt,
    _start_assistant,
)
from kunyu.agent.runtime.projection.run.budget import _reserve_budget, _settle_budget
from kunyu.agent.runtime.projection.run.interactions import (
    _request_confirmation,
    _request_question,
    _resolve_confirmation,
    _resolve_question,
    _select_plan_exit,
)
from kunyu.agent.runtime.projection.run.lifecycle import (
    _finish_run,
    _progress,
    _retry_boundary,
    _select_model,
    _validate_start,
)
from kunyu.agent.runtime.projection.run.tools import (
    _complete_tool,
    _fail_tool,
    _progress_tool,
    _request_tool,
)
from kunyu.agent.runtime.projection.run_state import (
    ReducedStepDecision,
    RunReductionError,
    _State,
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
