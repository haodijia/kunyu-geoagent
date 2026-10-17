"""Run projection lifecycle; derived exclusively from committed events."""

from dataclasses import replace

from kunyu.agent.runtime.contracts.retry_policy import (
    NormalRetryPolicy,
    retry_policy_key,
)
from kunyu.agent.runtime.events.base import ResumePhase, RunState
from kunyu.agent.runtime.events.run import (
    RetryScheduledEvent,
    RetryStartedEvent,
    RunModelSelectedEvent,
    RunProgressEvent,
    RunTerminalEvent,
)
from kunyu.agent.runtime.projection.run.budget import (
    _close_reservations,
    _require_budget,
)
from kunyu.agent.runtime.projection.run.guards import (
    _attempt_assistant,
    _attempt_tools,
    _complete_attempt_tools,
    _require_complete_tool_batch,
    _require_complete_tool_history,
    _settle_streaming_assistants,
    _transition,
)
from kunyu.agent.runtime.projection.run_state import (
    AssistantStatus,
    RunReductionError,
    _State,
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
