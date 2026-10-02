"""Bounded, event-sourced model and tool execution for one accepted run."""

import asyncio
from builtins import ExceptionGroup
from collections.abc import Callable
from datetime import datetime
from time import monotonic_ns

from kunyu.agent.runtime.context import ContextProvider
from kunyu.agent.runtime.driver import AgentRuntime
from kunyu.agent.runtime.events import (
    TERMINAL_RUN_STATES,
    EventBatch,
    EventDraft,
    EventStore,
    ResumePhase,
    RunProgressEvent,
    RunProgressPayload,
    RunState,
    RunTerminalEvent,
    RunTerminalPayload,
    StepDecisionEvent,
    StepDecisionPayload,
)
from kunyu.agent.runtime.hooks import (
    CancellationSignal,
    LoopHooks,
    StepProposal,
)
from kunyu.agent.runtime.models import (
    ModelAdapter,
)
from kunyu.agent.runtime.run_state import ReducedRun
from kunyu.agent.runtime.runner_model import ModelStepExecutor
from kunyu.agent.runtime.runner_tools import ToolBatchExecutor
from kunyu.agent.runtime.runner_types import (
    ConfirmationRequester,
    EventCommitError,
    RunExecution,
    RunExecutionProvider,
    RunnerConfig,
    RunnerConflictError,
    RunnerError,
    RunnerNotFoundError,
    ToolRegistryProvider,
    budget_usage,
    current_tool_batch,
    model_step_position,
    monotonic_seconds,
    utc_now,
)
from kunyu.agent.runtime.runner_types import (
    summary as summarize,
)
from kunyu.agent.runtime.tools import (
    PolicyGate,
)


class Runner[AdapterConfigT](AgentRuntime):
    """Execute one accepted run from committed facts with bounded side effects."""

    def __init__(
        self,
        executions: RunExecutionProvider[AdapterConfigT],
        events: EventStore,
        context: ContextProvider,
        model: ModelAdapter[AdapterConfigT],
        tools: ToolRegistryProvider,
        policy: PolicyGate,
        confirmations: ConfirmationRequester,
        hooks: LoopHooks,
        *,
        config: RunnerConfig | None = None,
        message_id_factory: Callable[[], str],
        tool_call_id_factory: Callable[[], str],
        operation_id_factory: Callable[[], str],
        clock: Callable[[], datetime] | None = None,
        monotonic_clock: Callable[[], float] | None = None,
        monotonic_ns_clock: Callable[[], int] | None = None,
    ) -> None:
        self._executions = executions
        self._events = events
        self._context = context
        self._hooks = hooks
        self._config = config or RunnerConfig()
        self._clock = clock or utc_now
        self._monotonic_clock = monotonic_clock or monotonic_seconds
        self._monotonic_ns = monotonic_ns_clock or monotonic_ns
        self._tool_executor = ToolBatchExecutor(
            executions,
            tools,
            policy,
            confirmations,
            self._config,
            operation_id_factory,
            self._clock,
            self._monotonic_ns,
            self._commit,
            self._fail_run,
        )
        self._model_executor = ModelStepExecutor(
            executions,
            context,
            model,
            tools,
            hooks,
            self._config,
            message_id_factory,
            tool_call_id_factory,
            operation_id_factory,
            self._clock,
            self._monotonic_clock,
            self._monotonic_ns,
            self._commit,
            self._fail_run,
            self._require_execution,
            self._signal,
        )
        self._active: dict[str, asyncio.Task[object]] = {}
        self._active_lock = asyncio.Lock()

    async def run(self, run_id: str) -> None:
        task = asyncio.current_task()
        if task is None:
            raise RunnerError("The runner requires an active asyncio task.")
        async with self._active_lock:
            if run_id in self._active:
                raise RunnerConflictError(f"Run '{run_id}' is already executing.")
            self._active[run_id] = task
        try:
            await self._drive(run_id)
        except asyncio.CancelledError:
            await asyncio.shield(self._interrupt_if_active(run_id))
            raise
        except Exception as error:
            run = (await self._require_execution(run_id)).run
            self._hooks.error(run, error)
            if run.state not in TERMINAL_RUN_STATES:
                try:
                    await self._fail_run(
                        run, "AGENT_EXTENSION_ERROR", "An Agent extension failed."
                    )
                except Exception as settlement_error:
                    raise ExceptionGroup(
                        "Agent extension and durable settlement both failed.",
                        [error, settlement_error],
                    ) from None
            raise
        finally:
            async with self._active_lock:
                if self._active.get(run_id) is task:
                    self._active.pop(run_id, None)

    async def cancel(self, run_id: str) -> None:
        async with self._active_lock:
            task = self._active.get(run_id)
            if task is not None and not task.done():
                task.cancel()

    async def _drive(self, run_id: str) -> None:
        execution = await self._require_execution(run_id)
        run = execution.run
        if (
            run.state in TERMINAL_RUN_STATES
            or run.state is RunState.WAITING_CONFIRMATION
        ):
            return
        if run.state is not RunState.READY:
            raise RunnerConflictError(
                f"Run '{run_id}' is not at an executable durable boundary."
            )
        if run.requires_resume:
            raise RunnerConflictError(
                f"Run '{run_id}' requires an explicit resume before execution."
            )

        if run.resume_phase is ResumePhase.MODEL:
            if not await self._start_model_phase(run):
                return
        else:
            await self._start_tool_phase(run)

        while True:
            execution = await self._require_execution(run_id)
            run = execution.run
            if run.state is RunState.MODEL_RUNNING:
                outcome = await self._model_executor.execute(execution)
                if outcome == "retry":
                    continue
                if outcome == "stopping":
                    run = (await self._require_execution(run_id)).run
                    if not await self._context.has_pending(run.run_id):
                        await self._hooks.turn_stopping(run, self._signal())
                    if not await self._context.has_pending(run.run_id):
                        run = (await self._require_execution(run_id)).run
                        await self._complete_run(run)
                        return
                    if not await self._start_model_phase(run):
                        return
                    continue
                if outcome != "tools":
                    return
                run = (await self._require_execution(run_id)).run
                await self._start_tool_phase(run)
                continue
            if run.state is RunState.TOOL_RUNNING:
                outcome = await self._tool_executor.execute(run)
                if outcome != "continue":
                    return
                run = (await self._require_execution(run_id)).run
                if not await self._start_model_phase(run):
                    return
                continue
            if run.state in TERMINAL_RUN_STATES or run.state in {
                RunState.WAITING_CONFIRMATION,
                RunState.INTERRUPTED,
            }:
                return
            raise RunnerConflictError(
                f"Run '{run_id}' left the executable state machine."
            )

    def _signal(self) -> CancellationSignal:
        task = asyncio.current_task()
        if task is None:
            raise RunnerError("Agent hooks require the active loop task.")
        return CancellationSignal(task)

    async def _complete_run(
        self, run: ReducedRun, *, reason: str | None = None
    ) -> None:
        await self._commit(
            run,
            (
                RunTerminalEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="run.completed",
                    payload=RunTerminalPayload(
                        state="completed", reason=reason, budget=budget_usage(run)
                    ),
                    occurred_at=self._clock(),
                ),
            ),
        )

    async def _start_model_phase(self, run: ReducedRun) -> bool:
        step, attempt = model_step_position(run)
        self._model_executor.reset()
        if not any(item.payload.step == step for item in run.decisions):
            messages = await self._context.propose(run.run_id, step)
            decision = await self._hooks.pre_step(
                StepProposal(run, step, attempt, messages, self._signal())
            )
            payload = StepDecisionPayload(
                step=step,
                attempt=attempt,
                input_ids=[item.message_id for item in messages],
                kind=decision.kind,
                messages=list(decision.messages) if decision.kind == "enter" else [],
                reason=decision.reason if decision.kind == "reject" else None,
            )
            await self._commit(
                run,
                (
                    StepDecisionEvent(
                        session_id=run.session_id,
                        run_id=run.run_id,
                        event_type="agent/step/decision",
                        payload=payload,
                        occurred_at=self._clock(),
                    ),
                ),
            )
            run = (await self._require_execution(run.run_id)).run
            if decision.kind == "reject":
                await self._commit(
                    run,
                    (
                        RunTerminalEvent(
                            session_id=run.session_id,
                            run_id=run.run_id,
                            event_type="run.cancelled",
                            payload=RunTerminalPayload(
                                state="cancelled",
                                reason=decision.reason,
                                budget=budget_usage(run),
                            ),
                            occurred_at=self._clock(),
                        ),
                    ),
                )
                return False
            if run.step == 0 and not decision.messages:
                await self._complete_run(
                    run, reason="No input was admitted by the pre-step hook."
                )
                return False
        await self._commit(
            run,
            (
                RunProgressEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="run.started",
                    payload=RunProgressPayload(
                        step=step,
                        attempt=attempt,
                        resume_phase="model",
                        next_tool_index=0,
                        requires_resume=False,
                        queue_sequence=None,
                        reason=None,
                        budget=budget_usage(run),
                    ),
                    occurred_at=self._clock(),
                ),
            ),
        )

        return True

    async def _start_tool_phase(self, run: ReducedRun) -> None:
        if run.state not in {RunState.READY, RunState.MODEL_RUNNING}:
            raise RunnerConflictError("The tool phase cannot start from this state.")
        calls = current_tool_batch(run)
        if not calls or run.next_tool_index > len(calls):
            raise RunnerConflictError("The current model attempt has no tool batch.")
        await self._commit(
            run,
            (
                RunProgressEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="run.started",
                    payload=RunProgressPayload(
                        step=run.step,
                        attempt=run.attempt,
                        resume_phase="tool",
                        next_tool_index=run.next_tool_index,
                        requires_resume=False,
                        queue_sequence=None,
                        reason=None,
                        budget=budget_usage(run),
                    ),
                    occurred_at=self._clock(),
                ),
            ),
        )

    async def _fail_run(self, run: ReducedRun, code: str, summary: str) -> None:
        await self._commit(
            run,
            (
                RunTerminalEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="run.failed",
                    payload=RunTerminalPayload(
                        state="failed",
                        reason=summarize(f"{code}: {summary}"),
                        budget=budget_usage(run),
                    ),
                    occurred_at=self._clock(),
                ),
            ),
        )

    async def _interrupt_if_active(self, run_id: str) -> None:
        execution = await self._executions.get(run_id)
        if execution is None:
            return
        run = execution.run
        if run.state not in {RunState.MODEL_RUNNING, RunState.TOOL_RUNNING}:
            return
        await self._commit(
            run,
            (
                RunProgressEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="run.interrupted",
                    payload=RunProgressPayload(
                        step=run.step,
                        attempt=run.attempt,
                        resume_phase=run.resume_phase.value,
                        next_tool_index=run.next_tool_index,
                        requires_resume=True,
                        queue_sequence=None,
                        reason="Run execution was interrupted.",
                        budget=budget_usage(run),
                    ),
                    occurred_at=self._clock(),
                ),
            ),
        )

    async def _require_execution(self, run_id: str) -> RunExecution[AdapterConfigT]:
        execution = await self._executions.get(run_id)
        if execution is None:
            raise RunnerNotFoundError(run_id)
        return execution

    async def _commit(self, run: ReducedRun, events: tuple[EventDraft, ...]) -> None:
        try:
            await self._events.commit(
                EventBatch(session_id=run.session_id, run_id=run.run_id, events=events)
            )
        except Exception as error:
            raise EventCommitError("Agent event commit failed.") from error
