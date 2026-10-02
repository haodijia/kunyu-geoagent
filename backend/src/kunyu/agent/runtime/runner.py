"""Bounded, event-sourced model and tool execution for one accepted run."""

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from time import monotonic_ns
from typing import Literal

from pydantic import JsonValue, TypeAdapter, ValidationError

from kunyu.agent.runtime.context import ContextProvider
from kunyu.agent.runtime.driver import AgentRuntime
from kunyu.agent.runtime.events import (
    TERMINAL_RUN_STATES,
    AssistantCompletedEvent,
    AssistantCompletedPayload,
    AssistantDeltaEvent,
    AssistantDeltaPayload,
    AssistantReasoningDeltaEvent,
    AssistantStartedEvent,
    AssistantStartedPayload,
    BudgetReservedEvent,
    BudgetReservedPayload,
    BudgetSettledEvent,
    BudgetSettledPayload,
    EventBatch,
    EventDraft,
    EventStore,
    ModelAttemptFinishedEvent,
    ModelAttemptFinishedPayload,
    RequestHeaderEvent,
    RequestHeaderPayload,
    ResumePhase,
    RunProgressEvent,
    RunProgressPayload,
    RunState,
    RunTerminalEvent,
    RunTerminalPayload,
    ToolRequestedEvent,
    ToolRequestedPayload,
)
from kunyu.agent.runtime.models import (
    ModelAdapter,
    ModelAdapterError,
    ModelFinish,
    ModelFinishReason,
    ModelMessage,
    ModelRequest,
    ModelRole,
    ModelToolCall,
    ReasoningDelta,
    TextDelta,
    TokenUsage,
)
from kunyu.agent.runtime.run_state import ReducedRun
from kunyu.agent.runtime.runner_tools import ToolBatchExecutor
from kunyu.agent.runtime.runner_types import (
    ConfirmationRequester,
    DeltaBuffer,
    RunExecution,
    RunExecutionProvider,
    RunnerConfig,
    RunnerConflictError,
    RunnerError,
    RunnerNotFoundError,
    ToolRegistryProvider,
    budget_usage,
    current_tool_batch,
    current_tool_batch_complete,
    elapsed_milliseconds,
    monotonic_seconds,
    settled_model_budget,
    utc_now,
)
from kunyu.agent.runtime.runner_types import (
    summary as summarize,
)
from kunyu.agent.runtime.tools import (
    PolicyGate,
    ToolCall,
    ToolNotFoundError,
    ToolRegistry,
    ToolValidationError,
)

_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])
logger = logging.getLogger(__name__)

type _ModelOutcome = Literal[
    "stop",
    "tool_calls",
    "length",
    "content_filter",
    "cancelled",
    "error",
]
type _AssistantFinish = Literal["stop", "tool_calls"]


def _system_prompt(messages: tuple[ModelMessage, ...]) -> str:
    return "\n\n".join(
        message.content for message in messages if message.role is ModelRole.SYSTEM
    )


def _message_snapshot(message: ModelMessage) -> dict[str, JsonValue]:
    value: dict[str, JsonValue] = {
        "role": message.role.value,
        "content": message.content,
    }
    if message.reasoning_content is not None:
        value["reasoning_content"] = message.reasoning_content
    if message.context_source is not None:
        value["source"] = {"kind": "context", "producer": message.context_source}
    if message.tool_call_id is not None:
        value["tool_call_id"] = message.tool_call_id
    if message.tool_calls:
        value["tool_calls"] = [
            {
                "call_id": call.call_id,
                "name": call.name,
                "arguments": dict(call.arguments),
            }
            for call in message.tool_calls
        ]
    return value


@dataclass(frozen=True, slots=True)
class _ValidatedToolCall:
    tool_call_id: str
    provider_call_id: str
    name: str
    arguments: dict[str, JsonValue]
    execution: Literal["parallel", "exclusive"]
    presentation: Literal["context", "search", "write"]


@dataclass(slots=True)
class _ModelAttempt:
    message_id: str
    operation_id: str
    reserved_milliseconds: int
    initial_active_milliseconds: int
    buffer: DeltaBuffer
    reasoning_buffer: DeltaBuffer
    usage: TokenUsage | None = None
    finish: ModelFinishReason | None = None
    tool_calls: list[ModelToolCall] | None = None


class _ModelOutputError(RuntimeError):
    pass


class _OutputBudgetError(_ModelOutputError):
    pass


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
        self._model = model
        self._tools = tools
        self._policy = policy
        self._confirmations = confirmations
        self._config = config or RunnerConfig()
        self._message_id_factory = message_id_factory
        self._tool_call_id_factory = tool_call_id_factory
        self._operation_id_factory = operation_id_factory
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
            await self._start_model_phase(run)
        else:
            await self._start_tool_phase(run)

        while True:
            execution = await self._require_execution(run_id)
            run = execution.run
            if run.state is RunState.MODEL_RUNNING:
                outcome = await self._execute_model(execution)
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
                await self._start_model_phase(run)
                continue
            if run.state in TERMINAL_RUN_STATES or run.state in {
                RunState.WAITING_CONFIRMATION,
                RunState.INTERRUPTED,
            }:
                return
            raise RunnerConflictError(
                f"Run '{run_id}' left the executable state machine."
            )

    async def _start_model_phase(self, run: ReducedRun) -> None:
        if run.state is RunState.READY:
            if run.step == 0:
                step, attempt = 1, 1
            elif current_tool_batch_complete(run):
                step, attempt = run.step + 1, 1
            else:
                step, attempt = run.step, run.attempt
        elif run.state is RunState.TOOL_RUNNING:
            if not current_tool_batch_complete(run):
                raise RunnerConflictError(
                    "A model step requires the complete current tool batch."
                )
            step, attempt = run.step + 1, 1
        else:
            raise RunnerConflictError("The model phase cannot start from this state.")
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

    async def _execute_model(self, execution: RunExecution[AdapterConfigT]) -> str:
        run = execution.run
        remaining_milliseconds = (
            run.budget.max_active_milliseconds - run.budget.active_milliseconds
        )
        if run.budget.model_calls >= run.budget.max_model_calls:
            await self._fail_run(
                run, "MODEL_CALL_LIMIT", "Model call budget exhausted."
            )
            return "failed"
        if remaining_milliseconds <= 0:
            await self._fail_run(
                run, "ACTIVE_TIME_LIMIT", "Active-time budget exhausted."
            )
            return "failed"
        if run.budget.output_codepoints >= run.budget.max_output_codepoints:
            await self._fail_run(run, "OUTPUT_LIMIT", "Output budget exhausted.")
            return "failed"

        try:
            context = await self._context.build(run.run_id)
            registry = self._tools.for_run(run.run_id)
        except Exception:
            logger.exception("Failed to assemble context for run %s", run.run_id)
            await self._fail_run(
                run,
                "RUN_CONTEXT_INVALID",
                "The committed run context could not be assembled.",
            )
            return "failed"

        reserved_milliseconds = min(
            self._config.model_active_time_slice_milliseconds,
            remaining_milliseconds,
        )
        attempt = _ModelAttempt(
            message_id=self._message_id_factory(),
            operation_id=self._operation_id_factory(),
            reserved_milliseconds=reserved_milliseconds,
            initial_active_milliseconds=run.budget.active_milliseconds,
            buffer=DeltaBuffer(
                0,
                clock=self._monotonic_clock,
                interval_seconds=self._config.delta_flush_interval_seconds,
                codepoint_limit=self._config.delta_flush_codepoints,
            ),
            tool_calls=[],
            reasoning_buffer=DeltaBuffer(
                0,
                clock=self._monotonic_clock,
                interval_seconds=self._config.delta_flush_interval_seconds,
                codepoint_limit=self._config.delta_flush_codepoints,
            ),
        )
        now = self._clock()
        await self._commit(
            run,
            (
                BudgetReservedEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="run.budget_reserved",
                    payload=BudgetReservedPayload(
                        operation_id=attempt.operation_id,
                        operation_type="model",
                        operation_count=1,
                        reserved_milliseconds=reserved_milliseconds,
                    ),
                    occurred_at=now,
                ),
                RequestHeaderEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="request.header",
                    payload=RequestHeaderPayload(
                        message_id=attempt.message_id,
                        step=run.step,
                        attempt=run.attempt,
                        model_id=run.model_snapshot.model_id,
                        reasoning_effort=run.model_snapshot.reasoning_effort,
                        max_output_tokens=run.model_snapshot.max_output_tokens,
                        system_prompt=_system_prompt(context.messages),
                        messages=[
                            _message_snapshot(message) for message in context.messages
                        ],
                        tools=[
                            {
                                "name": tool.name,
                                "description": tool.description,
                                "parameters": dict(tool.parameters),
                                "risk_level": tool.risk_level.value,
                                "execution": tool.execution,
                                "presentation": tool.presentation,
                            }
                            for tool in registry.specs
                        ],
                    ),
                    occurred_at=now,
                ),
                AssistantStartedEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="message.assistant.started",
                    payload=AssistantStartedPayload(
                        message_id=attempt.message_id,
                        step=run.step,
                        attempt=run.attempt,
                    ),
                    occurred_at=now,
                ),
            ),
        )

        request = ModelRequest(
            run_id=run.run_id,
            adapter_config=execution.adapter_config,
            model_id=run.model_snapshot.model_id,
            messages=context.messages,
            tools=registry.specs,
            max_output_tokens=run.model_snapshot.max_output_tokens,
            reasoning_effort=run.model_snapshot.reasoning_effort,
        )
        started_ns = self._monotonic_ns()
        try:
            async with asyncio.timeout(reserved_milliseconds / 1_000):
                await self._consume_model_stream(run, request, attempt)
            elapsed = elapsed_milliseconds(started_ns, self._monotonic_ns())
            return await self._finish_model_success(run, registry, attempt, elapsed)
        except asyncio.CancelledError:
            elapsed = elapsed_milliseconds(started_ns, self._monotonic_ns())
            await self._finish_model_interrupted(run, attempt, elapsed)
            raise
        except _OutputBudgetError:
            elapsed = elapsed_milliseconds(started_ns, self._monotonic_ns())
            await self._finish_model_failure(
                run,
                attempt,
                elapsed,
                outcome="length",
                error_code="OUTPUT_LIMIT",
                summary="Model output exceeded the run output budget.",
            )
            return "failed"
        except TimeoutError:
            await self._finish_model_failure(
                run,
                attempt,
                reserved_milliseconds,
                outcome="error",
                error_code="PROVIDER_TIMEOUT",
                summary="The model call exceeded its active-time slice.",
            )
            return "failed"
        except ModelAdapterError as error:
            elapsed = elapsed_milliseconds(started_ns, self._monotonic_ns())
            await self._finish_model_failure(
                run,
                attempt,
                elapsed,
                outcome="error",
                error_code=error.code.value,
                summary=str(error),
            )
            return "failed"
        except _ModelOutputError:
            elapsed = elapsed_milliseconds(started_ns, self._monotonic_ns())
            await self._finish_model_failure(
                run,
                attempt,
                elapsed,
                outcome="error",
                error_code="PROVIDER_PROTOCOL",
                summary="The model stream violated the output contract.",
            )
            return "failed"
        except Exception:
            logger.exception("Unexpected model failure for run %s", run.run_id)
            elapsed = elapsed_milliseconds(started_ns, self._monotonic_ns())
            await self._finish_model_failure(
                run,
                attempt,
                elapsed,
                outcome="error",
                error_code="MODEL_RUNTIME_ERROR",
                summary="The model call failed before a valid terminal result.",
            )
            return "failed"

    async def _consume_model_stream(
        self,
        run: ReducedRun,
        request: ModelRequest[AdapterConfigT],
        attempt: _ModelAttempt,
    ) -> None:
        stream = self._model.stream(request)
        terminal_seen = False
        try:
            async for output in stream:
                if terminal_seen:
                    raise _ModelOutputError("Output followed the terminal result.")
                due = attempt.buffer.flush_if_due()
                if due is not None:
                    await self._commit_delta(run, attempt, due)
                reasoning_due = attempt.reasoning_buffer.flush_if_due()
                if reasoning_due is not None:
                    await self._commit_delta(
                        run, attempt, reasoning_due, reasoning=True
                    )
                if isinstance(output, (TextDelta, ReasoningDelta)):
                    reasoning = isinstance(output, ReasoningDelta)
                    buffer = attempt.reasoning_buffer if reasoning else attempt.buffer
                    remaining = (
                        run.budget.max_output_codepoints
                        - run.budget.output_codepoints
                        - attempt.buffer.content_length
                        - attempt.reasoning_buffer.content_length
                    )
                    if len(output.text) > remaining:
                        if remaining > 0:
                            batch = buffer.add(output.text[:remaining])
                            if batch is not None:
                                await self._commit_delta(
                                    run, attempt, batch, reasoning=reasoning
                                )
                        raise _OutputBudgetError
                    batch = buffer.add(output.text)
                    if batch is not None:
                        await self._commit_delta(
                            run, attempt, batch, reasoning=reasoning
                        )
                elif isinstance(output, ModelToolCall):
                    if any(
                        call.call_id == output.call_id
                        for call in attempt.tool_calls or ()
                    ):
                        raise _ModelOutputError("Duplicate provider tool-call ID.")
                    if attempt.finish is not None:
                        raise _ModelOutputError("Tool call followed finish result.")
                    assert attempt.tool_calls is not None
                    attempt.tool_calls.append(output)
                elif isinstance(output, TokenUsage):
                    if attempt.usage is not None:
                        raise _ModelOutputError("Usage was reported more than once.")
                    attempt.usage = output
                elif isinstance(output, ModelFinish):
                    if attempt.finish is not None:
                        raise _ModelOutputError("Finish was reported more than once.")
                    attempt.finish = output.reason
                    terminal_seen = True
                else:
                    raise _ModelOutputError("Unknown model output.")
        finally:
            close = getattr(stream, "aclose", None)
            if close is not None:
                await close()
        if attempt.finish is None:
            raise _ModelOutputError("The model stream ended without a finish result.")

    async def _finish_model_success(
        self,
        run: ReducedRun,
        registry: ToolRegistry,
        attempt: _ModelAttempt,
        elapsed_milliseconds: int,
    ) -> str:
        finish = attempt.finish
        calls = tuple(attempt.tool_calls or ())
        if finish is ModelFinishReason.STOP:
            if calls or attempt.buffer.content_length == 0:
                raise _ModelOutputError("Stop output has invalid content.")
            validated: tuple[_ValidatedToolCall, ...] = ()
        elif finish is ModelFinishReason.TOOL_CALLS:
            if not calls:
                raise _ModelOutputError("Tool finish has no complete calls.")
            try:
                validated = self._validate_tool_batch(run.run_id, registry, calls)
            except (ToolNotFoundError, ToolValidationError, ValidationError):
                await self._finish_model_failure(
                    run,
                    attempt,
                    elapsed_milliseconds,
                    outcome="error",
                    error_code="TOOL_CALL_INVALID",
                    summary="The model requested an unavailable or invalid tool.",
                    assistant_finish="tool_calls",
                )
                return "failed"
        elif finish is ModelFinishReason.LENGTH:
            await self._finish_model_failure(
                run,
                attempt,
                elapsed_milliseconds,
                outcome="length",
                error_code="MODEL_LENGTH",
                summary="The model response reached its output token limit.",
            )
            return "failed"
        elif finish is ModelFinishReason.CONTENT_FILTER:
            await self._finish_model_failure(
                run,
                attempt,
                elapsed_milliseconds,
                outcome="content_filter",
                error_code="MODEL_CONTENT_FILTER",
                summary="The provider blocked the model response.",
            )
            return "failed"
        else:
            raise _ModelOutputError("The model finish result is invalid.")

        events = self._model_settlement_events(
            run,
            attempt,
            elapsed_milliseconds,
            outcome=finish.value,
            error_code=None,
            assistant_finish=finish.value,
        )
        now = self._clock()
        if finish is ModelFinishReason.TOOL_CALLS:
            events.extend(
                ToolRequestedEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="tool.requested",
                    payload=ToolRequestedPayload(
                        tool_call_id=call.tool_call_id,
                        provider_call_id=call.provider_call_id,
                        message_id=attempt.message_id,
                        step=run.step,
                        attempt=run.attempt,
                        batch_index=index,
                        name=call.name,
                        arguments=call.arguments,
                        execution=call.execution,
                        presentation=call.presentation,
                    ),
                    occurred_at=now,
                )
                for index, call in enumerate(validated)
            )
        else:
            events.append(
                RunTerminalEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="run.completed",
                    payload=RunTerminalPayload(
                        state="completed",
                        reason=None,
                        budget=settled_model_budget(
                            run,
                            reserved_milliseconds=attempt.reserved_milliseconds,
                            elapsed_milliseconds=elapsed_milliseconds,
                            content_length=attempt.buffer.content_length
                            + attempt.reasoning_buffer.content_length,
                            usage=attempt.usage,
                        ),
                    ),
                    occurred_at=now,
                )
            )
        await self._commit(run, tuple(events))
        return "tools" if finish is ModelFinishReason.TOOL_CALLS else "completed"

    def _validate_tool_batch(
        self,
        run_id: str,
        registry: ToolRegistry,
        calls: tuple[ModelToolCall, ...],
    ) -> tuple[_ValidatedToolCall, ...]:
        validated: list[_ValidatedToolCall] = []
        for call in calls:
            tool = registry.require(call.name)
            arguments = _JSON_OBJECT_ADAPTER.validate_python(
                dict(tool.validate(call.arguments))
            )
            tool_call_id = self._tool_call_id_factory()
            policy_call = ToolCall(
                run_id=run_id,
                call_id=tool_call_id,
                name=call.name,
                arguments=arguments,
            )
            self._policy.decide(policy_call)
            validated.append(
                _ValidatedToolCall(
                    tool_call_id=tool_call_id,
                    provider_call_id=call.call_id,
                    name=call.name,
                    arguments=arguments,
                    execution=tool.spec.execution,
                    presentation=tool.spec.presentation,
                )
            )
        return tuple(validated)

    async def _finish_model_failure(
        self,
        run: ReducedRun,
        attempt: _ModelAttempt,
        elapsed_milliseconds: int,
        *,
        outcome: _ModelOutcome,
        error_code: str,
        summary: str,
        assistant_finish: _AssistantFinish | None = None,
    ) -> None:
        events = self._model_settlement_events(
            run,
            attempt,
            elapsed_milliseconds,
            outcome=outcome,
            error_code=error_code,
            assistant_finish=assistant_finish,
        )
        events.append(
            RunTerminalEvent(
                session_id=run.session_id,
                run_id=run.run_id,
                event_type="run.failed",
                payload=RunTerminalPayload(
                    state="failed",
                    reason=summary[:500],
                    budget=settled_model_budget(
                        run,
                        reserved_milliseconds=attempt.reserved_milliseconds,
                        elapsed_milliseconds=elapsed_milliseconds,
                        content_length=attempt.buffer.content_length
                        + attempt.reasoning_buffer.content_length,
                        usage=attempt.usage,
                    ),
                ),
                occurred_at=self._clock(),
            )
        )
        await self._commit(run, tuple(events))

    async def _finish_model_interrupted(
        self,
        run: ReducedRun,
        attempt: _ModelAttempt,
        elapsed_milliseconds: int,
    ) -> None:
        events = self._model_settlement_events(
            run,
            attempt,
            elapsed_milliseconds,
            outcome="cancelled",
            error_code="RUN_INTERRUPTED",
            assistant_finish=None,
        )
        events.append(
            RunProgressEvent(
                session_id=run.session_id,
                run_id=run.run_id,
                event_type="run.interrupted",
                payload=RunProgressPayload(
                    step=run.step,
                    attempt=run.attempt,
                    resume_phase="model",
                    next_tool_index=run.next_tool_index,
                    requires_resume=True,
                    queue_sequence=None,
                    reason="Model execution was interrupted.",
                    budget=settled_model_budget(
                        run,
                        reserved_milliseconds=attempt.reserved_milliseconds,
                        elapsed_milliseconds=elapsed_milliseconds,
                        content_length=attempt.buffer.content_length
                        + attempt.reasoning_buffer.content_length,
                        usage=attempt.usage,
                    ),
                ),
                occurred_at=self._clock(),
            )
        )
        await self._commit(run, tuple(events))

    def _model_settlement_events(
        self,
        run: ReducedRun,
        attempt: _ModelAttempt,
        elapsed_milliseconds: int,
        *,
        outcome: _ModelOutcome,
        error_code: str | None,
        assistant_finish: _AssistantFinish | None,
    ) -> list[EventDraft]:
        elapsed_milliseconds = min(
            attempt.reserved_milliseconds, max(0, elapsed_milliseconds)
        )
        now = self._clock()
        events: list[EventDraft] = []
        pending = attempt.buffer.flush()
        if pending is not None:
            events.append(self._delta_event(run, attempt, pending, now))
        reasoning_pending = attempt.reasoning_buffer.flush()
        if reasoning_pending is not None:
            events.append(
                self._delta_event(run, attempt, reasoning_pending, now, reasoning=True)
            )
        events.append(
            BudgetSettledEvent(
                session_id=run.session_id,
                run_id=run.run_id,
                event_type="run.budget_settled",
                payload=BudgetSettledPayload(
                    operation_id=attempt.operation_id,
                    operation_type="model",
                    operation_count=1,
                    reserved_milliseconds=attempt.reserved_milliseconds,
                    actual_milliseconds=elapsed_milliseconds,
                    charged_milliseconds=elapsed_milliseconds,
                    crashed=False,
                ),
                occurred_at=now,
            )
        )
        if assistant_finish is not None:
            events.append(
                AssistantCompletedEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="message.assistant.completed",
                    payload=AssistantCompletedPayload(
                        message_id=attempt.message_id,
                        step=run.step,
                        attempt=run.attempt,
                        content_length=attempt.buffer.content_length,
                        finish_reason=assistant_finish,
                    ),
                    occurred_at=now,
                )
            )
        usage = attempt.usage or TokenUsage()
        events.append(
            ModelAttemptFinishedEvent(
                session_id=run.session_id,
                run_id=run.run_id,
                event_type="model.attempt.finished",
                payload=ModelAttemptFinishedPayload(
                    step=run.step,
                    attempt=run.attempt,
                    outcome=outcome,
                    error_code=error_code,
                    input_tokens=usage.input_tokens,
                    output_tokens=usage.output_tokens,
                    total_tokens=usage.total_tokens,
                    cumulative_active_milliseconds=(
                        attempt.initial_active_milliseconds + elapsed_milliseconds
                    ),
                ),
                occurred_at=now,
            )
        )
        return events

    async def _commit_delta(
        self,
        run: ReducedRun,
        attempt: _ModelAttempt,
        batch: tuple[int, str],
        *,
        reasoning: bool = False,
    ) -> None:
        await self._commit(
            run,
            (
                self._delta_event(
                    run, attempt, batch, self._clock(), reasoning=reasoning
                ),
            ),
        )

    @staticmethod
    def _delta_event(
        run: ReducedRun,
        attempt: _ModelAttempt,
        batch: tuple[int, str],
        occurred_at: datetime,
        *,
        reasoning: bool = False,
    ) -> AssistantDeltaEvent | AssistantReasoningDeltaEvent:
        offset, text = batch
        event_class = AssistantReasoningDeltaEvent if reasoning else AssistantDeltaEvent
        return event_class(
            session_id=run.session_id,
            run_id=run.run_id,
            event_type="message.assistant.reasoning.delta"
            if reasoning
            else "message.assistant.delta",
            payload=AssistantDeltaPayload(
                message_id=attempt.message_id,
                step=run.step,
                attempt=run.attempt,
                offset=offset,
                text=text,
            ),
            occurred_at=occurred_at,
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
        await self._events.commit(
            EventBatch(session_id=run.session_id, run_id=run.run_id, events=events)
        )
