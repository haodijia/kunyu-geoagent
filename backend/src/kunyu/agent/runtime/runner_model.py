"""One model step, including durable streaming settlement and request retries."""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from pydantic import JsonValue, TypeAdapter

from kunyu.agent.runtime.content import (
    ReasoningBlock,
    TextBlock,
    ToolCallBlock,
    content_text,
)
from kunyu.agent.runtime.context import AgentContext, ContextProvider
from kunyu.agent.runtime.events import (
    AssistantStartedEvent,
    AssistantStartedPayload,
    BudgetReservedEvent,
    BudgetReservedPayload,
    EventDraft,
    ModelSnapshotPayload,
    RequestHeaderEvent,
    RequestHeaderPayload,
    RunProgressEvent,
    RunProgressPayload,
    RunTerminalEvent,
    RunTerminalPayload,
    ToolRequestedEvent,
    ToolRequestedPayload,
)
from kunyu.agent.runtime.hooks import (
    CancellationSignal,
    LoopHooks,
    RequestFailure,
    RequestRetry,
)
from kunyu.agent.runtime.message_snapshot import message_snapshot
from kunyu.agent.runtime.model_attempt import (
    AssistantFinish,
    ModelAttempt,
    ModelOutcome,
    delta_event,
    model_settlement,
)
from kunyu.agent.runtime.models import (
    BlockEnd,
    BlockStart,
    ModelAdapter,
    ModelAdapterError,
    ModelErrorCode,
    ModelFinish,
    ModelFinishReason,
    ModelMessage,
    ModelRequest,
    ModelRole,
    ModelToolCallDelta,
    ReasoningDelta,
    TextDelta,
    TokenUsage,
)
from kunyu.agent.runtime.run_state import ReducedRun
from kunyu.agent.runtime.runner_types import (
    DeltaBuffer,
    EventCommitError,
    RunExecution,
    RunExecutionProvider,
    RunnerConfig,
    ToolRegistryProvider,
    budget_usage,
    elapsed_milliseconds,
    settled_model_budget,
)
from kunyu.agent.runtime.tools import (
    ToolRegistry,
)

_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])
logger = logging.getLogger(__name__)


def _system_prompt(messages: tuple[ModelMessage, ...]) -> str:
    return "\n\n".join(
        content_text(message.content)
        for message in messages
        if message.role is ModelRole.SYSTEM
    )


@dataclass(frozen=True, slots=True)
class _PlannedToolCall:
    tool_call_id: str
    provider_call_id: str
    name: str
    arguments: dict[str, JsonValue]
    execution: Literal["parallel", "exclusive"]
    presentation: Literal["context", "search", "write"]


class _ModelOutputError(RuntimeError):
    pass


class _OutputBudgetError(_ModelOutputError):
    pass


class ModelStepExecutor[AdapterConfigT]:
    def __init__(
        self,
        executions: RunExecutionProvider[AdapterConfigT],
        context: ContextProvider,
        model: ModelAdapter[AdapterConfigT],
        tools: ToolRegistryProvider,
        hooks: LoopHooks,
        config: RunnerConfig,
        message_id_factory: Callable[[], str],
        tool_call_id_factory: Callable[[], str],
        operation_id_factory: Callable[[], str],
        clock: Callable[[], datetime],
        monotonic_clock: Callable[[], float],
        monotonic_ns_clock: Callable[[], int],
        commit: Callable[[ReducedRun, tuple[EventDraft, ...]], Awaitable[None]],
        fail_run: Callable[[ReducedRun, str, str], Awaitable[None]],
        require_execution: Callable[[str], Awaitable[RunExecution[AdapterConfigT]]],
        signal: Callable[[], CancellationSignal],
    ) -> None:
        self._executions, self._context, self._model, self._tools = (
            executions,
            context,
            model,
            tools,
        )
        self._hooks, self._config = hooks, config
        self._message_id_factory, self._tool_call_id_factory = (
            message_id_factory,
            tool_call_id_factory,
        )
        self._operation_id_factory = operation_id_factory
        self._clock, self._monotonic_clock, self._monotonic_ns = (
            clock,
            monotonic_clock,
            monotonic_ns_clock,
        )
        self._commit, self._fail_run, self._require_execution, self._signal = (
            commit,
            fail_run,
            require_execution,
            signal,
        )
        self._prepared_context: AgentContext | None = None

    def reset(self) -> None:
        self._prepared_context = None

    async def execute(self, execution: RunExecution[AdapterConfigT]) -> str:
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
            if self._prepared_context is None:
                self._prepared_context = await self._context.build(run.run_id)
            context = self._prepared_context
            registry = self._tools.for_run(run.run_id)
        except Exception as error:
            logger.exception("Failed to assemble context for run %s", run.run_id)
            self._hooks.error(run, error)
            await self._fail_run(
                run,
                "RUN_CONTEXT_INVALID",
                "The committed run context could not be assembled.",
            )
            return "failed"

        seed = (
            run.model_snapshot if run.request_snapshot is None else run.request_snapshot
        )
        call_config = await self._hooks.request(run, seed, self._signal())
        adapter_config = self._executions.prepare(call_config)
        reserved_milliseconds = min(
            self._config.model_active_time_slice_milliseconds,
            remaining_milliseconds,
        )
        attempt = ModelAttempt(
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
            output_limit=run.budget.max_output_codepoints
            - run.budget.output_codepoints,
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
                        model_id=call_config.model_id,
                        reasoning_effort=call_config.reasoning_effort,
                        max_output_tokens=call_config.max_output_tokens,
                        model_snapshot=call_config,
                        system_prompt=_system_prompt(context.messages),
                        messages=[
                            message_snapshot(message) for message in context.messages
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
            adapter_config=adapter_config,
            model_id=call_config.model_id,
            messages=context.messages,
            tools=registry.specs,
            max_output_tokens=call_config.max_output_tokens,
            reasoning_effort=call_config.reasoning_effort,
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
            return await self._handle_request_failure(
                run,
                attempt,
                reserved_milliseconds,
                "PROVIDER_TIMEOUT",
                "The model call exceeded its active-time slice.",
                call_config,
            )
        except ModelAdapterError as error:
            return await self._handle_request_failure(
                run,
                attempt,
                elapsed_milliseconds(started_ns, self._monotonic_ns()),
                error.code.value,
                str(error),
                call_config,
                error.provider_retry_after_ms,
                error.offload_images,
            )
        except _ModelOutputError as error:
            return await self._handle_request_failure(
                run,
                attempt,
                elapsed_milliseconds(started_ns, self._monotonic_ns()),
                "PROVIDER_PROTOCOL",
                str(error),
                call_config,
            )
        except EventCommitError:
            raise
        except Exception:
            logger.exception("Unexpected model failure for run %s", run.run_id)
            return await self._handle_request_failure(
                run,
                attempt,
                elapsed_milliseconds(started_ns, self._monotonic_ns()),
                "MODEL_RUNTIME_ERROR",
                "The model request failed unexpectedly.",
                call_config,
            )
        finally:
            self._hooks.assistant_abandoned(run)

    async def _handle_request_failure(
        self,
        run: ReducedRun,
        attempt: ModelAttempt,
        elapsed: int,
        code: str,
        message: str,
        call_config: ModelSnapshotPayload,
        provider_retry_after_ms: float | None = None,
        offload_images: int | None = None,
    ) -> str:
        await self._commit(
            run,
            model_settlement(
                run,
                attempt,
                elapsed,
                now=self._clock(),
                outcome="error",
                error_code=code,
                assistant_finish=None,
            ).events,
        )
        run = (await self._require_execution(run.run_id)).run
        action = await self._hooks.request_error(
            run,
            RequestFailure(
                code,
                message,
                call_config.connection_id,
                call_config.retry_policy,
                provider_retry_after_ms,
                offload_images,
            ),
            self._signal(),
        )
        if not isinstance(action, RequestRetry):
            self._hooks.error(run, RuntimeError(f"{code}: {message}"))
            await self._fail_run(run, code, message)
            return "failed"
        if action.rebuild_context:
            self._prepared_context = None
        await self._commit(
            run,
            (
                RunProgressEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="run.retried",
                    payload=RunProgressPayload(
                        step=run.step,
                        attempt=run.attempt + 1,
                        resume_phase="model",
                        next_tool_index=0,
                        requires_resume=False,
                        queue_sequence=None,
                        reason=message[:500],
                        budget=budget_usage(run),
                    ),
                    occurred_at=self._clock(),
                ),
            ),
        )
        return "retry"

    async def _consume_model_stream(
        self,
        run: ReducedRun,
        request: ModelRequest[AdapterConfigT],
        attempt: ModelAttempt,
    ) -> None:
        stream = self._model.stream(request)
        terminal_seen = False
        try:
            async for output in stream:
                if terminal_seen:
                    raise _ModelOutputError("Output followed the terminal result.")
                try:
                    timed = attempt.stream.push(
                        output, int(self._clock().timestamp() * 1_000)
                    )
                except (TypeError, ValueError) as error:
                    raise _ModelOutputError(
                        "The model returned an invalid stream chunk."
                    ) from error
                output = timed.output
                self._hooks.assistant_output(run, timed)
                try:
                    accepted = attempt.assembler.push(output)
                except (TypeError, ValueError) as error:
                    raise _ModelOutputError(str(error)) from error
                if not accepted:
                    logger.warning(
                        "Ignored redundant %s for model block %s in run %s",
                        type(output).__name__,
                        output.index,
                        run.run_id,
                    )
                    continue
                due = attempt.buffer.flush_if_due()
                if due is not None:
                    await self._commit_delta(run, attempt, due)
                reasoning_due = attempt.reasoning_buffer.flush_if_due()
                if reasoning_due is not None:
                    await self._commit_delta(
                        run, attempt, reasoning_due, reasoning=True
                    )
                if isinstance(output, BlockEnd) and isinstance(
                    output.block, (TextBlock, ReasoningBlock)
                ):
                    observed = attempt.assembler.observed_text(
                        output.index, output.block.type
                    )
                    if not observed and output.block.text:
                        output = (
                            ReasoningDelta(output.index, output.block.text)
                            if isinstance(output.block, ReasoningBlock)
                            else TextDelta(output.index, output.block.text)
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
                elif isinstance(output, ModelToolCallDelta):
                    pass  # Fragments are recorded; only complete calls may execute.
                elif isinstance(output, (BlockStart, BlockEnd)):
                    pass  # The canonical assembler owns block lifecycle.
                elif isinstance(output, TokenUsage):
                    pass
                elif isinstance(output, ModelFinish):
                    if (
                        output.replay_state is not None
                        and attempt.assembler.replay_state is None
                    ):
                        logger.warning(
                            "Discarded unaligned provider replay metadata for run %s",
                            run.run_id,
                        )
                    terminal_seen = True
                else:
                    raise _ModelOutputError("Unknown model output.")
                if attempt.assembler.output_codepoints > attempt.output_limit:
                    raise _OutputBudgetError
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
        attempt: ModelAttempt,
        elapsed_milliseconds: int,
    ) -> str:
        finish = attempt.finish
        try:
            calls = tuple(
                block
                for block in attempt.assembler.blocks()
                if isinstance(block, ToolCallBlock)
            )
        except ValueError as error:
            raise _ModelOutputError(
                "The model returned incomplete content blocks."
            ) from error
        if finish is ModelFinishReason.STOP:
            if calls:
                raise _ModelOutputError("Stop output has invalid content.")
            if not content_text(attempt.assembler.blocks()).strip():
                raise ModelAdapterError(
                    ModelErrorCode.EMPTY_RESPONSE,
                    "The provider returned an empty response.",
                )
            validated: tuple[_PlannedToolCall, ...] = ()
        elif finish is ModelFinishReason.TOOL_CALLS:
            if not calls:
                raise _ModelOutputError("Tool finish has no complete calls.")
            validated = self._plan_tool_batch(registry, calls)
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

        settlement = model_settlement(
            run,
            attempt,
            elapsed_milliseconds,
            now=self._clock(),
            outcome=finish.value,
            error_code=None,
            assistant_finish=finish.value,
        )
        events = list(settlement.events)
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
        await self._commit(run, tuple(events))
        return "tools" if finish is ModelFinishReason.TOOL_CALLS else "stopping"

    def _plan_tool_batch(
        self,
        registry: ToolRegistry,
        calls: tuple[ToolCallBlock, ...],
    ) -> tuple[_PlannedToolCall, ...]:
        validated: list[_PlannedToolCall] = []
        identities: set[str] = set()
        for call in calls:
            if call.id in identities:
                raise _ModelOutputError("Duplicate provider tool-call ID.")
            identities.add(call.id)
            tool = registry.get(call.name)
            # Preserve model arguments verbatim. Validation is a tool result, so the
            # next model step can correct the call without losing the assistant frame.
            try:
                arguments = _JSON_OBJECT_ADAPTER.validate_python(
                    json.loads(call.arguments, parse_constant=_reject_json_constant)
                )
            except (ValueError, TypeError) as error:
                raise _ModelOutputError(
                    "Tool arguments must be a JSON object."
                ) from error
            tool_call_id = self._tool_call_id_factory()
            validated.append(
                _PlannedToolCall(
                    tool_call_id=tool_call_id,
                    provider_call_id=call.id,
                    name=call.name,
                    arguments=arguments,
                    execution="exclusive" if tool is None else tool.spec.execution,
                    presentation="context" if tool is None else tool.spec.presentation,
                )
            )
        return tuple(validated)

    async def _finish_model_failure(
        self,
        run: ReducedRun,
        attempt: ModelAttempt,
        elapsed_milliseconds: int,
        *,
        outcome: ModelOutcome,
        error_code: str,
        summary: str,
        assistant_finish: AssistantFinish | None = None,
    ) -> None:
        settlement = model_settlement(
            run,
            attempt,
            elapsed_milliseconds,
            now=self._clock(),
            outcome=outcome,
            error_code=error_code,
            assistant_finish=assistant_finish,
        )
        events = list(settlement.events)
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
                        content_length=settlement.output_codepoints,
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
        attempt: ModelAttempt,
        elapsed_milliseconds: int,
    ) -> None:
        settlement = model_settlement(
            run,
            attempt,
            elapsed_milliseconds,
            now=self._clock(),
            outcome="cancelled",
            error_code="RUN_INTERRUPTED",
            assistant_finish=None,
        )
        events = list(settlement.events)
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
                        content_length=settlement.output_codepoints,
                        usage=attempt.usage,
                    ),
                ),
                occurred_at=self._clock(),
            )
        )
        await self._commit(run, tuple(events))

    async def _commit_delta(
        self,
        run: ReducedRun,
        attempt: ModelAttempt,
        batch: tuple[int, str],
        *,
        reasoning: bool = False,
    ) -> None:
        await self._commit(
            run,
            (delta_event(run, attempt, batch, self._clock(), reasoning=reasoning),),
        )


def _reject_json_constant(value: str) -> None:
    raise ValueError(f"Non-finite JSON constant: {value}")
