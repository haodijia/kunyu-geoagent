"""Delegation identities and outcomes derived from the parent journal."""

from dataclasses import dataclass, replace
from datetime import datetime

from kunyu.agent.runtime.events.base import RunState
from kunyu.agent.runtime.events.session import (
    SubagentCreatedEvent,
    SubagentCreatedPayload,
    SubagentSettledEvent,
    SubagentSettledPayload,
    SubagentStartedEvent,
)
from kunyu.agent.runtime.projection.run_state import ReducedRun

MAX_CHILDREN_PER_RUN = 8


@dataclass(frozen=True, slots=True)
class ReducedSubagent:
    created: SubagentCreatedPayload
    created_at: datetime
    created_sequence: int
    active_run_id: str
    settled: SubagentSettledPayload | None = None
    settled_at: datetime | None = None
    settled_sequence: int | None = None


class SubagentProjection:
    def __init__(self) -> None:
        self.children: dict[str, ReducedSubagent] = {}
        self._started_runs: set[str] = set()
        self._settled_runs: set[tuple[str, str]] = set()

    def accept(
        self,
        event: SubagentCreatedEvent | SubagentStartedEvent | SubagentSettledEvent,
        sequence: int,
        owner: ReducedRun,
    ) -> None:
        payload = event.payload
        if payload.owner_run_id != owner.run_id:
            raise ValueError("Delegation belongs to another parent run.")
        if isinstance(event, SubagentCreatedEvent):
            if (
                payload.child_session_id == event.session_id
                or payload.child_run_id == owner.run_id
                or payload.child_session_id in self.children
                or any(
                    child.created.tool_call_id == payload.tool_call_id
                    or child.created.child_run_id == payload.child_run_id
                    for child in self.children.values()
                )
            ):
                raise ValueError(
                    "Delegation identities must be unique and independent."
                )
            count = sum(
                child.created.owner_run_id == owner.run_id
                for child in self.children.values()
            )
            if count >= MAX_CHILDREN_PER_RUN:
                raise ValueError("The parent run has exhausted its delegation limit.")
            call = next(
                (
                    call
                    for call in owner.tool_calls
                    if call.tool_call_id == payload.tool_call_id
                ),
                None,
            )
            if (
                owner.state is not RunState.TOOL_RUNNING
                or call is None
                or call.name != "subagent"
                or call.status != "running"
                or call.arguments.get("description") != payload.description
                or call.arguments.get("prompt") != payload.prompt
            ):
                raise ValueError("Delegation must match an executing parent tool call.")
            if payload.model_snapshot != (
                owner.request_snapshot or owner.model_snapshot
            ):
                raise ValueError("Delegation must freeze the parent model snapshot.")
            self._started_runs.add(payload.child_run_id)
            self.children[payload.child_session_id] = ReducedSubagent(
                created=payload,
                created_at=event.occurred_at,
                created_sequence=sequence,
                active_run_id=payload.child_run_id,
            )
            return
        child = self.children.get(payload.child_session_id)
        if isinstance(event, SubagentStartedEvent):
            if (
                child is None
                or payload.owner_run_id != child.created.owner_run_id
                or payload.child_run_id in self._started_runs
            ):
                raise ValueError(
                    "A child activation requires its existing parent and a new run."
                )
            self._started_runs.add(payload.child_run_id)
            self.children[payload.child_session_id] = replace(
                child,
                active_run_id=payload.child_run_id,
                settled=None,
                settled_at=None,
                settled_sequence=None,
            )
            return
        if (
            child is None
            or child.created.owner_run_id != owner.run_id
            or payload.child_run_id not in self._started_runs
            or (payload.child_session_id, payload.child_run_id) in self._settled_runs
            or event.occurred_at < child.created_at
        ):
            raise ValueError("Delegation settlement requires one matching open child.")
        self._settled_runs.add((payload.child_session_id, payload.child_run_id))
        self.children[payload.child_session_id] = replace(
            child,
            settled=payload,
            settled_at=event.occurred_at,
            settled_sequence=sequence,
        )
