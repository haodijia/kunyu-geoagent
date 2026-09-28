"""Ordered, durable event boundary; storage transactions belong to adapters."""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class AgentEvent:
    id: str
    session_id: str
    sequence: int
    event_type: str
    payload: Mapping[str, object]
    occurred_at: datetime
    run_id: str | None = None


class EventStore(Protocol):
    async def append(
        self,
        session_id: str,
        event_type: str,
        payload: Mapping[str, object],
        run_id: str | None = None,
    ) -> AgentEvent: ...

    async def list_after(self, session_id: str, sequence: int) -> tuple[AgentEvent, ...]: ...
