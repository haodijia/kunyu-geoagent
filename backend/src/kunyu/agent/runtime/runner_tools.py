"""Bounded tool pools, exclusive barriers and model-ordered durable results."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime

from pydantic import JsonValue, TypeAdapter, ValidationError

from kunyu.agent.runtime.events import (
    BudgetReservedEvent,
    BudgetReservedPayload,
    BudgetSettledEvent,
    BudgetSettledPayload,
    EventDraft,
    ToolCompletedEvent,
    ToolCompletedPayload,
    ToolFailedEvent,
    ToolFailedPayload,
    ToolProgressEvent,
    ToolProgressPayload,
    validate_event_draft,
)
from kunyu.agent.runtime.run_state import ReducedRun, ReducedToolCall
from kunyu.agent.runtime.runner_types import (
    ConfirmationRequester,
    RunExecutionProvider,
    RunnerConfig,
    ToolRegistryProvider,
    current_tool_batch,
    elapsed_milliseconds,
    summary,
)
from kunyu.agent.runtime.tool_content import TOOL_CONTENT_ADAPTER, ToolContentBlock
from kunyu.agent.runtime.tools import (
    PolicyDecision,
    PolicyGate,
    Tool,
    ToolCall,
    ToolExecutionError,
    ToolNotFoundError,
    ToolRegistry,
    ToolResult,
    ToolRiskLevel,
    ToolValidationError,
)

logger = logging.getLogger(__name__)
_JSON_VALUE_ADAPTER = TypeAdapter(JsonValue)
_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])

type CommitEvents = Callable[[ReducedRun, tuple[EventDraft, ...]], Awaitable[None]]
type FailRun = Callable[[ReducedRun, str, str], Awaitable[None]]


@dataclass(frozen=True, slots=True)
class _PreparedTool:
    persisted: ReducedToolCall
    tool: Tool
    call: ToolCall


@dataclass(frozen=True, slots=True)
class _Invocation:
    elapsed_milliseconds: int
    finished_at: datetime
    result: JsonValue | None = None
    content: tuple[ToolContentBlock, ...] = ()
    events: tuple[EventDraft, ...] = ()
    error_code: str | None = None
    error_summary: str | None = None


class ToolBatchExecutor[AdapterConfigT]:
    def __init__(
        self,
        executions: RunExecutionProvider[AdapterConfigT],
        tools: ToolRegistryProvider,
        policy: PolicyGate,
        confirmations: ConfirmationRequester,
        config: RunnerConfig,
        operation_id_factory: Callable[[], str],
        clock: Callable[[], datetime],
        monotonic_ns_clock: Callable[[], int],
        commit: CommitEvents,
        fail_run: FailRun,
    ) -> None:
        self._executions = executions
        self._tools = tools
        self._policy = policy
        self._confirmations = confirmations
        self._config = config
        self._operation_id_factory = operation_id_factory
        self._clock = clock
        self._monotonic_ns = monotonic_ns_clock
        self._commit = commit
        self._fail_run = fail_run

    async def execute(self, run: ReducedRun) -> str:
        while True:
            current = await self._current(run.run_id)
            calls = current_tool_batch(current)
            if current.next_tool_index >= len(calls):
                return "continue"
            registry = self._tools.for_run(current.run_id)
            persisted = calls[current.next_tool_index]
            try:
                prepared = self._prepare(current, persisted, registry)
            except (ToolNotFoundError, ToolValidationError, ValidationError) as error:
                outcome = await self._reject(
                    current, persisted, "TOOL_CALL_INVALID", str(error)
                )
                if outcome != "completed":
                    return outcome
                continue

            decision = self._policy.decide(prepared.call)
            if decision is PolicyDecision.CONFIRM:
                # Approval owns the exact write and commits its durable result.
                await self._confirmations.request(
                    current.run_id, persisted.tool_call_id
                )
                return "waiting"
            if decision is PolicyDecision.DENY:
                outcome = await self._reject(
                    current,
                    persisted,
                    "TOOL_POLICY_DENIED",
                    f"Tool '{persisted.name}' is not allowed by the current permission policy.",
                )
                if outcome != "completed":
                    return outcome
                continue
            group = self._parallel_group(current, calls, registry)
            if not group:
                group = (prepared,)
            outcome = await self._execute_group(current, group)
            if outcome != "completed":
                return outcome

    async def _current(self, run_id: str) -> ReducedRun:
        execution = await self._executions.get(run_id)
        if execution is None:
            raise RuntimeError(f"Run '{run_id}' disappeared during tool execution.")
        return execution.run

    def _prepare(
        self, run: ReducedRun, persisted: ReducedToolCall, registry: ToolRegistry
    ) -> _PreparedTool:
        tool = registry.require(persisted.name)
        arguments = _JSON_OBJECT_ADAPTER.validate_python(
            dict(tool.validate(persisted.arguments))
        )
        return _PreparedTool(
            persisted,
            tool,
            ToolCall(
                run_id=run.run_id,
                call_id=persisted.tool_call_id,
                name=persisted.name,
                arguments=arguments,
            ),
        )

    def _parallel_group(
        self,
        run: ReducedRun,
        calls: tuple[ReducedToolCall, ...],
        registry: ToolRegistry,
    ) -> tuple[_PreparedTool, ...]:
        group = []
        available = run.budget.max_tool_calls - run.budget.tool_calls
        for persisted in calls[run.next_tool_index : run.next_tool_index + available]:
            try:
                item = self._prepare(run, persisted, registry)
            except (ToolNotFoundError, ToolValidationError, ValidationError):
                break
            if (
                item.tool.spec.execution != "parallel"
                or self._policy.decide(item.call) is not PolicyDecision.ALLOW
                or self._policy.risk_level(item.call) is not ToolRiskLevel.L0
            ):
                break
            group.append(item)
        return tuple(group)

    async def _reserve(self, run: ReducedRun, count: int) -> tuple[str, int] | None:
        if run.budget.tool_calls + count > run.budget.max_tool_calls:
            await self._fail_run(run, "TOOL_CALL_LIMIT", "Tool call budget exhausted.")
            return None
        remaining = run.budget.max_active_milliseconds - run.budget.active_milliseconds
        if remaining < count:
            await self._fail_run(
                run, "ACTIVE_TIME_LIMIT", "Active-time budget exhausted."
            )
            return None
        reserved = min(
            count * self._config.tool_active_time_slice_milliseconds, remaining
        )
        operation_id = self._operation_id_factory()
        await self._commit(
            run,
            (
                BudgetReservedEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="run.budget_reserved",
                    payload=BudgetReservedPayload(
                        operation_id=operation_id,
                        operation_type="tool",
                        operation_count=count,
                        reserved_milliseconds=reserved,
                    ),
                    occurred_at=self._clock(),
                ),
            ),
        )
        return operation_id, reserved

    async def _start(self, run: ReducedRun, tool: ReducedToolCall) -> None:
        await self._commit(
            run,
            (
                ToolProgressEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="tool.started",
                    payload=ToolProgressPayload(
                        **_tool_common(tool), next_tool_index=run.next_tool_index
                    ),
                    occurred_at=self._clock(),
                ),
            ),
        )

    async def _execute_group(
        self, run: ReducedRun, group: tuple[_PreparedTool, ...]
    ) -> str:
        reservation = await self._reserve(run, len(group))
        if reservation is None:
            return "failed"
        operation_id, reserved = reservation
        timeout = reserved // len(group)
        semaphore = asyncio.Semaphore(self._config.max_parallel_tool_calls)

        async def dispatch(item: _PreparedTool) -> _Invocation:
            async with semaphore:
                await self._start(run, item.persisted)
                return await self._invoke(item, timeout)

        tasks = [asyncio.create_task(dispatch(item)) for item in group]
        try:
            invocations = await asyncio.gather(*tasks)
        finally:
            # Never let work outlive its owning run or replenish after cancellation.
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        await self._settle(
            run,
            operation_id,
            reserved,
            tuple(
                (item.persisted, result)
                for item, result in zip(group, invocations, strict=True)
            ),
        )
        return "completed"

    async def _invoke(self, item: _PreparedTool, timeout: int) -> _Invocation:
        started = self._monotonic_ns()
        try:
            async with asyncio.timeout(timeout / 1_000):
                result, content, events = _parse_tool_result(
                    await item.tool.execute(item.call), item.call
                )
            return _Invocation(
                elapsed_milliseconds(started, self._monotonic_ns()),
                self._clock(),
                result=result,
                content=content,
                events=events,
            )
        except TimeoutError:
            return _Invocation(
                timeout,
                self._clock(),
                error_code="TOOL_TIMEOUT",
                error_summary="The tool exceeded its active-time slice.",
            )
        except (
            ToolExecutionError,
            ToolValidationError,
            ValidationError,
            ValueError,
            LookupError,
            OSError,
        ) as error:
            logger.warning(
                "Tool %s in run %s failed: %s", item.call.name, item.call.run_id, error
            )
            return _Invocation(
                elapsed_milliseconds(started, self._monotonic_ns()),
                self._clock(),
                error_code=error.code
                if isinstance(error, ToolExecutionError)
                else "TOOL_EXECUTION_FAILED",
                error_summary=summary(str(error)),
            )
        except Exception:
            logger.exception(
                "Unexpected tool failure for run %s tool %s",
                item.call.run_id,
                item.call.call_id,
            )
            return _Invocation(
                elapsed_milliseconds(started, self._monotonic_ns()),
                self._clock(),
                error_code="TOOL_RUNTIME_ERROR",
                error_summary="The tool failed during local execution.",
            )

    async def _reject(
        self, run: ReducedRun, tool: ReducedToolCall, code: str, reason: str
    ) -> str:
        reservation = await self._reserve(run, 1)
        if reservation is None:
            return "failed"
        operation_id, reserved = reservation
        await self._start(run, tool)
        logger.warning("Tool %s in run %s rejected: %s", tool.name, run.run_id, reason)
        await self._settle(
            run,
            operation_id,
            reserved,
            (
                (
                    tool,
                    _Invocation(
                        0,
                        self._clock(),
                        error_code=code,
                        error_summary=summary(reason),
                    ),
                ),
            ),
        )
        return "completed"

    async def _settle(
        self,
        run: ReducedRun,
        operation_id: str,
        reserved: int,
        results: tuple[tuple[ReducedToolCall, _Invocation], ...],
    ) -> None:
        elapsed = min(reserved, sum(item.elapsed_milliseconds for _, item in results))
        events: list[EventDraft] = [
            BudgetSettledEvent(
                session_id=run.session_id,
                run_id=run.run_id,
                event_type="run.budget_settled",
                payload=BudgetSettledPayload(
                    operation_id=operation_id,
                    operation_type="tool",
                    operation_count=len(results),
                    reserved_milliseconds=reserved,
                    actual_milliseconds=elapsed,
                    charged_milliseconds=elapsed,
                    crashed=False,
                ),
                occurred_at=self._clock(),
            )
        ]
        for tool, invocation in results:
            common = _tool_common(tool)
            if invocation.error_code is None:
                events.extend(invocation.events)
                events.append(
                    ToolCompletedEvent(
                        session_id=run.session_id,
                        run_id=run.run_id,
                        event_type="tool.completed",
                        payload=ToolCompletedPayload(
                            **common,
                            next_tool_index=tool.batch_index + 1,
                            result=invocation.result,
                            content=invocation.content,
                        ),
                        occurred_at=invocation.finished_at,
                    )
                )
            else:
                events.append(
                    ToolFailedEvent(
                        session_id=run.session_id,
                        run_id=run.run_id,
                        event_type="tool.failed",
                        payload=ToolFailedPayload(
                            **common,
                            next_tool_index=tool.batch_index + 1,
                            error_code=invocation.error_code,
                            error_summary=invocation.error_summary,
                        ),
                        occurred_at=invocation.finished_at,
                    )
                )
        # Results stay in provider order even when execution finishes out of order.
        await self._commit(run, tuple(events))


def _parse_tool_result(
    result: object, call: ToolCall
) -> tuple[JsonValue, tuple[ToolContentBlock, ...], tuple[EventDraft, ...]]:
    if not isinstance(result, ToolResult):
        raise ToolExecutionError("The tool returned an invalid result envelope.")
    if not isinstance(result.content, tuple):
        raise ToolExecutionError("Tool content must be an immutable block tuple.")
    content = TOOL_CONTENT_ADAPTER.validate_python(result.content)
    if not isinstance(result.events, tuple):
        raise ToolExecutionError("Tool event drafts must be an immutable tuple.")
    for event in result.events:
        validate_event_draft(event)
        if event.run_id != call.run_id:
            raise ToolExecutionError("Tool event draft belongs to a different run.")
    return _JSON_VALUE_ADAPTER.validate_python(result.result), content, result.events


def _tool_common(tool: ReducedToolCall) -> dict[str, object]:
    return {
        "tool_call_id": tool.tool_call_id,
        "provider_call_id": tool.provider_call_id,
        "message_id": tool.message_id,
        "batch_index": tool.batch_index,
    }
