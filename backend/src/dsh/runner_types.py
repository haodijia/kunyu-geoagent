"""Shared runner contracts, limits, and deterministic projection helpers."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from time import monotonic_ns
from typing import Protocol

from dsh.events import BudgetUsagePayload
from dsh.models import TokenUsage
from dsh.run_state import ReducedRun, ReducedToolCall
from dsh.tools import ToolRegistry

MODEL_ACTIVE_TIME_SLICE_MILLISECONDS = 60_000
TOOL_ACTIVE_TIME_SLICE_MILLISECONDS = 5_000
DELTA_FLUSH_INTERVAL_SECONDS = 0.05
DELTA_FLUSH_CODEPOINTS = 1_024


class RunnerError(RuntimeError):
    """A run cannot be executed safely from its durable state."""


class RunnerNotFoundError(RunnerError):
    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        super().__init__(f"Run '{run_id}' was not found.")


class RunnerConflictError(RunnerError):
    """The requested run already has a driver or is not executable."""


@dataclass(frozen=True, slots=True)
class RunExecution[AdapterConfigT]:
    run: ReducedRun
    adapter_config: AdapterConfigT


class RunExecutionProvider[AdapterConfigT](Protocol):
    async def get(self, run_id: str) -> RunExecution[AdapterConfigT] | None: ...


class ToolRegistryProvider(Protocol):
    def for_run(self, run_id: str) -> ToolRegistry: ...


class ConfirmationRequester(Protocol):
    async def request(self, run_id: str, tool_call_id: str) -> None: ...


@dataclass(frozen=True, slots=True)
class RunnerConfig:
    model_active_time_slice_milliseconds: int = MODEL_ACTIVE_TIME_SLICE_MILLISECONDS
    tool_active_time_slice_milliseconds: int = TOOL_ACTIVE_TIME_SLICE_MILLISECONDS
    delta_flush_interval_seconds: float = DELTA_FLUSH_INTERVAL_SECONDS
    delta_flush_codepoints: int = DELTA_FLUSH_CODEPOINTS

    def __post_init__(self) -> None:
        if (
            self.model_active_time_slice_milliseconds <= 0
            or self.tool_active_time_slice_milliseconds <= 0
            or self.delta_flush_interval_seconds <= 0
            or self.delta_flush_codepoints <= 0
        ):
            raise ValueError("Runner limits must be positive.")


class DeltaBuffer:
    def __init__(
        self,
        offset: int,
        *,
        clock: Callable[[], float],
        interval_seconds: float,
        codepoint_limit: int,
    ) -> None:
        self._offset = offset
        self._clock = clock
        self._interval_seconds = interval_seconds
        self._codepoint_limit = codepoint_limit
        self._parts: list[str] = []
        self._codepoints = 0
        self._started_at: float | None = None

    @property
    def content_length(self) -> int:
        return self._offset + self._codepoints

    def add(self, text: str) -> tuple[int, str] | None:
        if not text:
            return None
        if self._started_at is None:
            self._started_at = self._clock()
        self._parts.append(text)
        self._codepoints += len(text)
        if self._codepoints >= self._codepoint_limit:
            return self.flush()
        return None

    def flush_if_due(self) -> tuple[int, str] | None:
        if self._started_at is None:
            return None
        if self._clock() - self._started_at < self._interval_seconds:
            return None
        return self.flush()

    def flush(self) -> tuple[int, str] | None:
        if not self._parts:
            return None
        offset = self._offset
        text = "".join(self._parts)
        self._offset += len(text)
        self._parts.clear()
        self._codepoints = 0
        self._started_at = None
        return offset, text


def current_tool_batch(run: ReducedRun) -> tuple[ReducedToolCall, ...]:
    return tuple(
        sorted(
            (
                call
                for call in run.tool_calls
                if call.step == run.step and call.attempt == run.attempt
            ),
            key=lambda call: call.batch_index,
        )
    )


def current_tool_batch_complete(run: ReducedRun) -> bool:
    calls = current_tool_batch(run)
    return (
        bool(calls)
        and run.next_tool_index == len(calls)
        and all(
            call.status == "completed" and call.batch_index == index
            for index, call in enumerate(calls)
        )
    )


def budget_usage(run: ReducedRun) -> BudgetUsagePayload:
    budget = run.budget
    return BudgetUsagePayload(
        model_calls=budget.model_calls,
        tool_calls=budget.tool_calls,
        active_milliseconds=budget.active_milliseconds,
        output_codepoints=budget.output_codepoints,
        input_tokens=budget.input_tokens,
        output_tokens=budget.output_tokens,
        total_tokens=budget.total_tokens,
    )


def settled_model_budget(
    run: ReducedRun,
    *,
    reserved_milliseconds: int,
    elapsed_milliseconds: int,
    content_length: int,
    usage: TokenUsage | None,
) -> BudgetUsagePayload:
    reported = usage or TokenUsage()
    budget = run.budget
    return BudgetUsagePayload(
        model_calls=budget.model_calls + 1,
        tool_calls=budget.tool_calls,
        active_milliseconds=(
            budget.active_milliseconds
            + min(reserved_milliseconds, max(0, elapsed_milliseconds))
        ),
        output_codepoints=budget.output_codepoints + content_length,
        input_tokens=add_known(budget.input_tokens, reported.input_tokens),
        output_tokens=add_known(budget.output_tokens, reported.output_tokens),
        total_tokens=add_known(budget.total_tokens, reported.total_tokens),
    )


def budget_usage_with_tool(
    run: ReducedRun, elapsed_milliseconds: int
) -> BudgetUsagePayload:
    budget = run.budget
    return BudgetUsagePayload(
        model_calls=budget.model_calls,
        tool_calls=budget.tool_calls + 1,
        active_milliseconds=budget.active_milliseconds + max(0, elapsed_milliseconds),
        output_codepoints=budget.output_codepoints,
        input_tokens=budget.input_tokens,
        output_tokens=budget.output_tokens,
        total_tokens=budget.total_tokens,
    )


def add_known(current: int | None, addition: int | None) -> int | None:
    if addition is None:
        return current
    return (current or 0) + addition


def elapsed_milliseconds(started_ns: int, finished_ns: int) -> int:
    return max(0, (finished_ns - started_ns) // 1_000_000)


def summary(value: str) -> str:
    return value[:500]


def utc_now() -> datetime:
    return datetime.now(UTC)


def monotonic_seconds() -> float:
    return monotonic_ns() / 1_000_000_000
