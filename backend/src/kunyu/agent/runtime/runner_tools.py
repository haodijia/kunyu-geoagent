"""Barrier-scheduled tool-batch execution for the bounded DSH runner."""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import TypedDict

from pydantic import JsonValue, TypeAdapter, ValidationError

from kunyu.agent.runtime.events import (
    BudgetReservedEvent,
    BudgetReservedPayload,
    BudgetSettledEvent,
    BudgetSettledPayload,
    EventDraft,
    RunProgressEvent,
    RunProgressPayload,
    RunState,
    RunTerminalEvent,
    RunTerminalPayload,
    ToolCompletedEvent,
    ToolCompletedPayload,
    ToolFailedEvent,
    ToolFailedPayload,
    ToolProgressEvent,
    ToolProgressPayload,
)
from kunyu.agent.runtime.run_state import ReducedRun, ReducedToolCall
from kunyu.agent.runtime.runner_types import (
    ConfirmationRequester,
    RunExecutionProvider,
    RunnerConfig,
    ToolRegistryProvider,
    budget_usage_with_tool,
    current_tool_batch,
    elapsed_milliseconds,
    summary,
)
from kunyu.agent.runtime.tools import (
    PolicyDecision,
    PolicyGate,
    Tool,
    ToolCall,
    ToolExecutionError,
    ToolNotFoundError,
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
    result: JsonValue | None = None
    error_code: str | None = None
    error_summary: str | None = None


class _ToolCommon(TypedDict):
    tool_call_id: str
    provider_call_id: str
    message_id: str
    batch_index: int


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
        registry = self._tools.for_run(run.run_id)
        while True:
            execution = await self._executions.get(run.run_id)
            if execution is None:
                raise RuntimeError(f"Run '{run.run_id}' disappeared during execution.")
            current = execution.run
            calls = current_tool_batch(current)
            if current.next_tool_index >= len(calls):
                return "continue"
            parallel = self._parallel_group(current, calls, registry)
            if len(parallel) > 1:
                outcome = await self._execute_parallel(current, parallel)
                if outcome != "completed":
                    return outcome
                continue
            tool_call = calls[current.next_tool_index]
            call = ToolCall(
                run_id=current.run_id,
                call_id=tool_call.tool_call_id,
                name=tool_call.name,
                arguments=tool_call.arguments,
            )
            decision = self._policy.decide(call)
            if decision is PolicyDecision.CONFIRM:
                try:
                    await self._confirmations.request(
                        current.run_id, tool_call.tool_call_id
                    )
                except Exception:
                    logger.exception(
                        "Failed to persist confirmation for run %s tool %s",
                        current.run_id,
                        tool_call.tool_call_id,
                    )
                    refreshed = await self._executions.get(current.run_id)
                    if (
                        refreshed is not None
                        and refreshed.run.state is RunState.WAITING_CONFIRMATION
                    ):
                        return "waiting"
                    await self._fail_run(
                        current,
                        "CONFIRMATION_REQUEST_FAILED",
                        "The exact tool confirmation could not be persisted.",
                    )
                    return "failed"
                return "waiting"
            if decision is PolicyDecision.DENY:
                await self._fail_run(
                    current,
                    "TOOL_POLICY_DENIED",
                    f"Tool '{tool_call.name}' is not authorized for this run.",
                )
                return "failed"
            try:
                tool = registry.require(tool_call.name)
                arguments = _JSON_OBJECT_ADAPTER.validate_python(
                    dict(tool.validate(tool_call.arguments))
                )
            except (ToolNotFoundError, ToolValidationError, ValidationError):
                await self._fail_run(
                    current,
                    "TOOL_CALL_INVALID",
                    "The persisted tool call no longer matches the registry.",
                )
                return "failed"
            outcome = await self._execute_tool(
                current,
                tool_call,
                tool,
                ToolCall(
                    run_id=current.run_id,
                    call_id=tool_call.tool_call_id,
                    name=tool_call.name,
                    arguments=arguments,
                ),
            )
            if outcome != "completed":
                return outcome

    def _parallel_group(
        self,
        run: ReducedRun,
        calls: tuple[ReducedToolCall, ...],
        registry,
    ) -> tuple[_PreparedTool, ...]:
        prepared: list[_PreparedTool] = []
        available_calls = run.budget.max_tool_calls - run.budget.tool_calls
        if available_calls < 2:
            return ()
        for persisted in calls[
            run.next_tool_index : run.next_tool_index + available_calls
        ]:
            tool = registry.require(persisted.name)
            call = ToolCall(
                run_id=run.run_id,
                call_id=persisted.tool_call_id,
                name=persisted.name,
                arguments=persisted.arguments,
            )
            if (
                tool.spec.execution != "parallel"
                or self._policy.decide(call) is not PolicyDecision.ALLOW
                or self._policy.risk_level(call) is not ToolRiskLevel.L0
            ):
                break
            arguments = _JSON_OBJECT_ADAPTER.validate_python(
                dict(tool.validate(persisted.arguments))
            )
            prepared.append(
                _PreparedTool(
                    persisted=persisted,
                    tool=tool,
                    call=ToolCall(
                        run_id=run.run_id,
                        call_id=persisted.tool_call_id,
                        name=persisted.name,
                        arguments=arguments,
                    ),
                )
            )
        return tuple(prepared)

    async def _execute_parallel(
        self,
        run: ReducedRun,
        prepared: tuple[_PreparedTool, ...],
    ) -> str:
        remaining = run.budget.max_active_milliseconds - run.budget.active_milliseconds
        if remaining <= 0:
            await self._fail_run(
                run, "ACTIVE_TIME_LIMIT", "Active-time budget exhausted."
            )
            return "failed"
        timeout_milliseconds = min(
            self._config.tool_active_time_slice_milliseconds,
            remaining,
        )
        invocations = await asyncio.gather(
            *(
                self._invoke_parallel_tool(item, timeout_milliseconds)
                for item in prepared
            )
        )
        for item, invocation in zip(prepared, invocations, strict=True):
            execution = await self._executions.get(run.run_id)
            if execution is None:
                raise RuntimeError(f"Run '{run.run_id}' disappeared during execution.")
            current = execution.run
            outcome = await self._commit_parallel_result(current, item, invocation)
            if outcome != "completed":
                return outcome
        return "completed"

    async def _invoke_parallel_tool(
        self,
        prepared: _PreparedTool,
        timeout_milliseconds: int,
    ) -> _Invocation:
        started_ns = self._monotonic_ns()
        try:
            async with asyncio.timeout(timeout_milliseconds / 1_000):
                result = _parse_tool_result(
                    await prepared.tool.execute(prepared.call)
                )
            return _Invocation(
                elapsed_milliseconds=elapsed_milliseconds(
                    started_ns, self._monotonic_ns()
                ),
                result=result,
            )
        except TimeoutError:
            return _Invocation(
                elapsed_milliseconds=timeout_milliseconds,
                error_code="TOOL_TIMEOUT",
                error_summary="The tool exceeded its active-time slice.",
            )
        except (ToolExecutionError, ValidationError, ValueError, TypeError):
            return _Invocation(
                elapsed_milliseconds=elapsed_milliseconds(
                    started_ns, self._monotonic_ns()
                ),
                error_code="TOOL_EXECUTION_FAILED",
                error_summary="The tool could not produce a valid result.",
            )
        except Exception:
            logger.exception(
                "Unexpected parallel tool failure for run %s tool %s",
                prepared.call.run_id,
                prepared.call.call_id,
            )
            return _Invocation(
                elapsed_milliseconds=elapsed_milliseconds(
                    started_ns, self._monotonic_ns()
                ),
                error_code="TOOL_RUNTIME_ERROR",
                error_summary="The tool failed during local execution.",
            )

    async def _commit_parallel_result(
        self,
        run: ReducedRun,
        prepared: _PreparedTool,
        invocation: _Invocation,
    ) -> str:
        remaining = run.budget.max_active_milliseconds - run.budget.active_milliseconds
        if run.budget.tool_calls >= run.budget.max_tool_calls:
            await self._fail_run(run, "TOOL_CALL_LIMIT", "Tool call budget exhausted.")
            return "failed"
        if remaining <= 0:
            await self._fail_run(run, "ACTIVE_TIME_LIMIT", "Active-time budget exhausted.")
            return "failed"
        reserved = min(
            self._config.tool_active_time_slice_milliseconds,
            remaining,
        )
        operation_id = self._operation_id_factory()
        now = self._clock()
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
                        operation_count=1,
                        reserved_milliseconds=reserved,
                    ),
                    occurred_at=now,
                ),
                ToolProgressEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="tool.started",
                    payload=ToolProgressPayload(
                        **_tool_common(prepared.persisted),
                        next_tool_index=prepared.persisted.batch_index,
                    ),
                    occurred_at=now,
                ),
            ),
        )
        await self._finish_tool(
            run,
            prepared.persisted,
            operation_id,
            reserved,
            min(reserved, invocation.elapsed_milliseconds),
            result=invocation.result,
            error_code=invocation.error_code,
            error_summary=invocation.error_summary,
        )
        return "completed" if invocation.error_code is None else "failed"

    async def _execute_tool(
        self,
        run: ReducedRun,
        persisted: ReducedToolCall,
        tool: Tool,
        call: ToolCall,
    ) -> str:
        remaining_milliseconds = (
            run.budget.max_active_milliseconds - run.budget.active_milliseconds
        )
        if run.budget.tool_calls >= run.budget.max_tool_calls:
            await self._fail_run(run, "TOOL_CALL_LIMIT", "Tool call budget exhausted.")
            return "failed"
        if remaining_milliseconds <= 0:
            await self._fail_run(
                run, "ACTIVE_TIME_LIMIT", "Active-time budget exhausted."
            )
            return "failed"
        reserved_milliseconds = min(
            self._config.tool_active_time_slice_milliseconds,
            remaining_milliseconds,
        )
        operation_id = self._operation_id_factory()
        now = self._clock()
        common = _tool_common(persisted)
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
                        operation_count=1,
                        reserved_milliseconds=reserved_milliseconds,
                    ),
                    occurred_at=now,
                ),
                ToolProgressEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="tool.started",
                    payload=ToolProgressPayload(
                        **common,
                        next_tool_index=persisted.batch_index,
                    ),
                    occurred_at=now,
                ),
            ),
        )
        started_ns = self._monotonic_ns()
        try:
            async with asyncio.timeout(reserved_milliseconds / 1_000):
                result = await tool.execute(call)
                parsed = _parse_tool_result(result)
            elapsed = elapsed_milliseconds(started_ns, self._monotonic_ns())
            await self._finish_tool(
                run,
                persisted,
                operation_id,
                reserved_milliseconds,
                elapsed,
                result=parsed,
            )
            return "completed"
        except asyncio.CancelledError:
            elapsed = elapsed_milliseconds(started_ns, self._monotonic_ns())
            await self._interrupt_tool(
                run,
                persisted,
                operation_id,
                reserved_milliseconds,
                elapsed,
            )
            raise
        except TimeoutError:
            await self._finish_tool(
                run,
                persisted,
                operation_id,
                reserved_milliseconds,
                reserved_milliseconds,
                error_code="TOOL_TIMEOUT",
                error_summary="The tool exceeded its active-time slice.",
            )
            return "failed"
        except (ToolExecutionError, ValidationError, ValueError, TypeError):
            elapsed = elapsed_milliseconds(started_ns, self._monotonic_ns())
            await self._finish_tool(
                run,
                persisted,
                operation_id,
                reserved_milliseconds,
                elapsed,
                error_code="TOOL_EXECUTION_FAILED",
                error_summary="The tool could not produce a valid result.",
            )
            return "failed"
        except Exception:
            logger.exception(
                "Unexpected tool failure for run %s tool %s",
                run.run_id,
                persisted.tool_call_id,
            )
            elapsed = elapsed_milliseconds(started_ns, self._monotonic_ns())
            await self._finish_tool(
                run,
                persisted,
                operation_id,
                reserved_milliseconds,
                elapsed,
                error_code="TOOL_RUNTIME_ERROR",
                error_summary="The tool failed during local execution.",
            )
            return "failed"

    async def _finish_tool(
        self,
        run: ReducedRun,
        tool: ReducedToolCall,
        operation_id: str,
        reserved_milliseconds: int,
        elapsed_milliseconds_value: int,
        *,
        result: JsonValue | None = None,
        error_code: str | None = None,
        error_summary: str | None = None,
    ) -> None:
        elapsed = min(reserved_milliseconds, max(0, elapsed_milliseconds_value))
        now = self._clock()
        common = _tool_common(tool)
        events: list[EventDraft] = [
            BudgetSettledEvent(
                session_id=run.session_id,
                run_id=run.run_id,
                event_type="run.budget_settled",
                payload=BudgetSettledPayload(
                    operation_id=operation_id,
                    operation_type="tool",
                    operation_count=1,
                    reserved_milliseconds=reserved_milliseconds,
                    actual_milliseconds=elapsed,
                    charged_milliseconds=elapsed,
                    crashed=False,
                ),
                occurred_at=now,
            )
        ]
        next_tool_index = tool.batch_index + 1
        if error_code is None:
            events.append(
                ToolCompletedEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="tool.completed",
                    payload=ToolCompletedPayload(
                        **common,
                        next_tool_index=next_tool_index,
                        result=result,
                    ),
                    occurred_at=now,
                )
            )
        else:
            events.extend(
                (
                    ToolFailedEvent(
                        session_id=run.session_id,
                        run_id=run.run_id,
                        event_type="tool.failed",
                        payload=ToolFailedPayload(
                            **common,
                            next_tool_index=next_tool_index,
                            error_code=error_code,
                            error_summary=summary(error_summary or "Tool failed."),
                        ),
                        occurred_at=now,
                    ),
                    RunTerminalEvent(
                        session_id=run.session_id,
                        run_id=run.run_id,
                        event_type="run.failed",
                        payload=RunTerminalPayload(
                            state="failed",
                            reason=summary(error_summary or "Tool failed."),
                            budget=budget_usage_with_tool(run, elapsed),
                        ),
                        occurred_at=now,
                    ),
                )
            )
        await self._commit(run, tuple(events))

    async def _interrupt_tool(
        self,
        run: ReducedRun,
        tool: ReducedToolCall,
        operation_id: str,
        reserved_milliseconds: int,
        elapsed_milliseconds_value: int,
    ) -> None:
        elapsed = min(reserved_milliseconds, max(0, elapsed_milliseconds_value))
        now = self._clock()
        await self._commit(
            run,
            (
                BudgetSettledEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="run.budget_settled",
                    payload=BudgetSettledPayload(
                        operation_id=operation_id,
                        operation_type="tool",
                        operation_count=1,
                        reserved_milliseconds=reserved_milliseconds,
                        actual_milliseconds=elapsed,
                        charged_milliseconds=elapsed,
                        crashed=False,
                    ),
                    occurred_at=now,
                ),
                ToolProgressEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="tool.cancelled",
                    payload=ToolProgressPayload(
                        **_tool_common(tool),
                        next_tool_index=tool.batch_index,
                    ),
                    occurred_at=now,
                ),
                RunProgressEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="run.interrupted",
                    payload=RunProgressPayload(
                        step=run.step,
                        attempt=run.attempt,
                        resume_phase="tool",
                        next_tool_index=run.next_tool_index,
                        requires_resume=True,
                        queue_sequence=None,
                        reason="Tool execution was interrupted.",
                        budget=budget_usage_with_tool(run, elapsed),
                    ),
                    occurred_at=now,
                ),
            ),
        )


def _parse_tool_result(result: object) -> JsonValue:
    if not isinstance(result, ToolResult):
        raise ToolExecutionError("The tool returned an invalid result envelope.")
    try:
        value = json.loads(result.content)
    except (TypeError, ValueError) as error:
        raise ToolExecutionError("The tool result is not valid JSON.") from error
    return _JSON_VALUE_ADAPTER.validate_python(value)


def _tool_common(tool: ReducedToolCall) -> _ToolCommon:
    return {
        "tool_call_id": tool.tool_call_id,
        "provider_call_id": tool.provider_call_id,
        "message_id": tool.message_id,
        "batch_index": tool.batch_index,
    }
