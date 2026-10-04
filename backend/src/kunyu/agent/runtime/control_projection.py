"""Session controls folded at their durable Agent boundaries."""

from dataclasses import replace

from kunyu.agent.runtime.events import (
    EventDraft,
    HistoryCompactedEvent,
    PermissionChangedEvent,
    PlanChangedEvent,
    PlanExitSelectedEvent,
    PlanSelectedEvent,
    RequestHeaderEvent,
    RunCreatedEvent,
    RunTerminalEvent,
    StepDecisionEvent,
)
from kunyu.domain.commands import SessionControls

CONTROL_BOUNDARIES = frozenset(
    {
        "run.created",
        "run.completed",
        "run.failed",
        "run.cancelled",
        "request.header",
    }
)


class ControlProjection:
    def __init__(self) -> None:
        self.state = SessionControls()
        self._open_runs: set[str] = set()

    def accept(self, event: EventDraft) -> None:
        if isinstance(event, (RunCreatedEvent, RunTerminalEvent, RequestHeaderEvent)):
            self.accept_boundary(event.event_type, event.run_id)
        elif isinstance(event, PlanExitSelectedEvent):
            if event.run_id not in self._open_runs or not self.state.plan_active:
                raise ValueError(
                    "Plan approval requires an active plan in an open turn."
                )
            self.state = replace(self.state, plan_pending=False, plan_narrate=False)
        elif isinstance(event, PlanSelectedEvent):
            if not self._open_runs:
                raise ValueError("Deferred plan selection requires an open turn.")
            self.state = replace(
                self.state,
                plan_narrate=True,
                plan_pending=event.payload.active
                if event.payload.active != self.state.plan_active
                else None,
            )
        elif isinstance(event, PlanChangedEvent):
            self.state = replace(
                self.state,
                plan_active=event.payload.active,
                plan_pending=None,
                plan_narrate=True,
            )
        elif isinstance(event, StepDecisionEvent):
            if event.payload.kind == "enter" and self.state.plan_pending is not None:
                self.state = replace(
                    self.state,
                    plan_active=self.state.plan_pending,
                    plan_pending=None,
                )
        elif isinstance(event, PermissionChangedEvent):
            self.state = replace(self.state, permission=event.payload.preset)
        elif isinstance(event, HistoryCompactedEvent):
            self.state = replace(
                self.state,
                summary=event.payload.summary,
                compacted_through=event.payload.through_sequence,
            )

    def accept_boundary(self, event_type: str, run_id: str | None) -> None:
        """Fold validated journal markers without loading request bodies."""
        if run_id is None or event_type not in CONTROL_BOUNDARIES:
            raise ValueError("Control boundary requires a known run marker.")
        if event_type == "run.created":
            self._open_runs.add(run_id)
        elif event_type == "request.header":
            self.state = replace(
                self.state,
                plan_at_last_header=self.state.plan_active,
                plan_narrate=True,
            )
        else:
            self._open_runs.discard(run_id)
