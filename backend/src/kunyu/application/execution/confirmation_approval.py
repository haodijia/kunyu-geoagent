"""Build and execute an approved tool operation within the caller transaction."""

from collections.abc import Callable
from datetime import datetime
from time import monotonic_ns

from pydantic import JsonValue, TypeAdapter
from sqlalchemy.orm import Session as DatabaseSession

from kunyu.agent.runtime.contracts.tools import ToolCall as PolicyToolCall
from kunyu.agent.runtime.events.run import (
    BudgetReservedEvent,
    BudgetReservedPayload,
    BudgetSettledEvent,
    BudgetSettledPayload,
    BudgetUsagePayload,
    RunProgressEvent,
    RunProgressPayload,
)
from kunyu.agent.runtime.events.store import EventDraft
from kunyu.agent.runtime.events.tools import (
    ConfirmationResolvedEvent,
    ToolCompletedEvent,
    ToolCompletedPayload,
    ToolProgressEvent,
    ToolProgressPayload,
)
from kunyu.agent.tools.registry import ToolPolicyGate, ToolRegistryFactory
from kunyu.agent.tools.shared import tool_result
from kunyu.application.execution.confirmation_policy import (
    validate_confirmation_snapshot,
)
from kunyu.domain.execution.confirmations import (
    ConfirmationConflictError,
)
from kunyu.persistence.records.execution import (
    ConfirmationRecord,
    RunRecord,
    ToolCallRecord,
)

TOOL_ACTIVE_TIME_SLICE_MILLISECONDS = 5_000
_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])


def approve_events(
    database_session: DatabaseSession,
    confirmation: ConfirmationRecord,
    run: RunRecord,
    tool: ToolCallRecord,
    resolved: ConfirmationResolvedEvent,
    now: datetime,
    queue_sequence: int,
    batch_size: int,
    *,
    tool_registries: ToolRegistryFactory,
    policy: ToolPolicyGate,
    operation_id_factory: Callable[[], str],
) -> tuple[EventDraft, ...]:
    arguments = validate_confirmation_snapshot(
        run.id,
        PolicyToolCall(
            run_id=run.id, call_id=tool.id, name=tool.name, arguments=tool.arguments
        ),
        tool_registries,
        policy,
    )
    if arguments != confirmation.arguments:
        raise ConfirmationConflictError(
            "The confirmed arguments no longer match the tool call."
        )
    remaining_milliseconds = run.max_active_milliseconds - run.active_milliseconds
    if remaining_milliseconds <= 0:
        raise ConfirmationConflictError("The run active-time budget is exhausted.")
    approval = tool_registries.require_approval(tool.name, run.id)
    if (
        approval.execution,
        approval.binding,
        approval.summary,
        approval.side_effect,
    ) != (
        confirmation.execution,
        confirmation.binding,
        confirmation.summary,
        confirmation.side_effect,
    ):
        raise ConfirmationConflictError(
            "The reviewed tool contract or binding has changed."
        )
    if approval.execution == "tool":
        return (
            resolved,
            RunProgressEvent(
                session_id=confirmation.session_id,
                run_id=confirmation.run_id,
                event_type="run.queued",
                payload=RunProgressPayload(
                    step=run.step,
                    attempt=run.attempt,
                    resume_phase="tool",
                    next_tool_index=tool.batch_index,
                    requires_resume=False,
                    queue_sequence=queue_sequence,
                    reason=None,
                    budget=_budget_usage(run),
                ),
                occurred_at=now,
            ),
        )
    reserved_milliseconds = min(
        TOOL_ACTIVE_TIME_SLICE_MILLISECONDS, remaining_milliseconds
    )
    operation_id = operation_id_factory()
    handler = tool_registries.require_transaction(tool.name, run.id)
    call = PolicyToolCall(
        run_id=run.id,
        call_id=tool.id,
        name=tool.name,
        arguments=arguments,
    )
    started_ns = monotonic_ns()
    result = _JSON_OBJECT_ADAPTER.validate_python(
        handler.execute(database_session, confirmation.workspace_id, call, now)
    )
    bound = tool_registries.for_run(run.id).require(tool.name)
    output = tool_result(result)
    actual_milliseconds = min(
        reserved_milliseconds,
        max(0, (monotonic_ns() - started_ns) // 1_000_000),
    )
    next_tool_index = tool.batch_index + 1
    common = {
        "tool_call_id": tool.id,
        "provider_call_id": tool.provider_call_id,
        "message_id": tool.message_id,
        "batch_index": tool.batch_index,
    }
    return (
        resolved,
        BudgetReservedEvent(
            session_id=confirmation.session_id,
            run_id=confirmation.run_id,
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
            session_id=confirmation.session_id,
            run_id=confirmation.run_id,
            event_type="tool.started",
            payload=ToolProgressPayload(
                **common,
                next_tool_index=tool.batch_index,
            ),
            occurred_at=now,
        ),
        BudgetSettledEvent(
            session_id=confirmation.session_id,
            run_id=confirmation.run_id,
            event_type="run.budget_settled",
            payload=BudgetSettledPayload(
                operation_id=operation_id,
                operation_type="tool",
                operation_count=1,
                reserved_milliseconds=reserved_milliseconds,
                actual_milliseconds=actual_milliseconds,
                charged_milliseconds=actual_milliseconds,
                crashed=False,
            ),
            occurred_at=now,
        ),
        ToolCompletedEvent(
            session_id=confirmation.session_id,
            run_id=confirmation.run_id,
            event_type="tool.completed",
            payload=ToolCompletedPayload(
                **common,
                next_tool_index=next_tool_index,
                result=result,
                content=bound.agent_result(output),
                display=bound.frontend_result(output),
                compact=bound.compact_result(output),
            ),
            occurred_at=now,
        ),
        RunProgressEvent(
            session_id=confirmation.session_id,
            run_id=confirmation.run_id,
            event_type="run.queued",
            payload=RunProgressPayload(
                step=run.step,
                attempt=run.attempt,
                resume_phase=("tool" if next_tool_index < batch_size else "model"),
                next_tool_index=next_tool_index,
                requires_resume=False,
                queue_sequence=queue_sequence,
                reason=None,
                budget=BudgetUsagePayload(
                    model_calls=run.model_calls,
                    tool_calls=run.tool_calls + 1,
                    active_milliseconds=(run.active_milliseconds + actual_milliseconds),
                    output_codepoints=run.output_codepoints,
                    input_tokens=run.input_tokens,
                    output_tokens=run.output_tokens,
                    total_tokens=run.total_tokens,
                ),
            ),
            occurred_at=now,
        ),
    )


def _budget_usage(run: RunRecord) -> BudgetUsagePayload:
    return BudgetUsagePayload(
        model_calls=run.model_calls,
        tool_calls=run.tool_calls,
        active_milliseconds=run.active_milliseconds,
        output_codepoints=run.output_codepoints,
        input_tokens=run.input_tokens,
        output_tokens=run.output_tokens,
        total_tokens=run.total_tokens,
    )
