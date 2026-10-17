"""Run projection budget; derived exclusively from committed events."""

from kunyu.agent.runtime.events.base import RunState
from kunyu.agent.runtime.events.run import (
    BudgetReservedEvent,
    BudgetSettledEvent,
    BudgetUsagePayload,
)
from kunyu.agent.runtime.projection.run.guards import _approved_pending_confirmation
from kunyu.agent.runtime.projection.run_state import (
    RunReductionError,
    _Reservation,
    _State,
)


def _reserve_budget(state: _State, event: BudgetReservedEvent) -> None:
    payload = event.payload
    if payload.operation_id in state.operation_ids:
        raise RunReductionError("Budget operation identifiers must be unique.")
    if state.reservations:
        raise RunReductionError("Only one model or tool operation can be active.")
    allowed_states = (
        {RunState.MODEL_RUNNING}
        if payload.operation_type == "model"
        else {
            RunState.TOOL_RUNNING,
            RunState.WAITING_CONFIRMATION,
        }
    )
    if state.state not in allowed_states:
        raise RunReductionError(
            "Budget reservation does not match the active run phase."
        )
    if (
        state.state is RunState.WAITING_CONFIRMATION
        and _approved_pending_confirmation(state) is None
    ):
        raise RunReductionError(
            "A waiting run can only reserve its approved write tool."
        )
    if (
        state.budget.active_milliseconds + payload.reserved_milliseconds
        > state.budget.max_active_milliseconds
    ):
        raise RunReductionError("Run active-time budget is exhausted.")
    if payload.operation_type == "model":
        state.budget.model_calls += payload.operation_count
    else:
        state.budget.tool_calls += payload.operation_count
    state.budget.active_milliseconds += payload.reserved_milliseconds
    state.operation_ids.add(payload.operation_id)
    state.reservations[payload.operation_id] = _Reservation(
        operation_type=payload.operation_type,
        operation_count=payload.operation_count,
        reserved_milliseconds=payload.reserved_milliseconds,
    )


def _settle_budget(state: _State, event: BudgetSettledEvent) -> None:
    payload = event.payload
    reservation = state.reservations.pop(payload.operation_id, None)
    if reservation is None:
        raise RunReductionError("Budget settlement has no matching reservation.")
    if (
        reservation.operation_type != payload.operation_type
        or reservation.operation_count != payload.operation_count
        or reservation.reserved_milliseconds != payload.reserved_milliseconds
    ):
        raise RunReductionError("Budget settlement differs from its reservation.")
    if payload.charged_milliseconds > payload.reserved_milliseconds:
        raise RunReductionError("Budget settlement cannot exceed its reservation.")
    if payload.crashed:
        if (
            payload.actual_milliseconds is not None
            or payload.charged_milliseconds != payload.reserved_milliseconds
        ):
            raise RunReductionError(
                "A crashed operation charges its full reserved time."
            )
    elif (
        payload.actual_milliseconds is None
        or payload.charged_milliseconds != payload.actual_milliseconds
    ):
        raise RunReductionError(
            "A completed operation must charge its measured active time."
        )
    state.budget.active_milliseconds += (
        payload.charged_milliseconds - payload.reserved_milliseconds
    )


def _require_budget(state: _State, payload: BudgetUsagePayload) -> None:
    budget = state.budget
    actual = (
        budget.model_calls,
        budget.tool_calls,
        budget.active_milliseconds,
        budget.output_codepoints,
        budget.input_tokens,
        budget.output_tokens,
        budget.total_tokens,
    )
    expected = (
        payload.model_calls,
        payload.tool_calls,
        payload.active_milliseconds,
        payload.output_codepoints,
        payload.input_tokens,
        payload.output_tokens,
        payload.total_tokens,
    )
    if actual != expected:
        raise RunReductionError("Event budget snapshot differs from reduced usage.")


def _add_known(current: int | None, addition: int | None) -> int | None:
    if addition is None:
        return current
    return (current or 0) + addition


def _close_reservations(state: _State) -> None:
    state.reservations.clear()
