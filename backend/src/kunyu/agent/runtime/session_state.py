"""Immutable query state derived from one Agent session event log."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from kunyu.agent.runtime.run_state import ReducedRun


class SessionReductionError(ValueError):
    """The durable session event sequence cannot be replayed safely."""


@dataclass(frozen=True, slots=True)
class ReducedUserMessage:
    message_id: str
    session_id: str
    run_id: str | None
    content: str
    created_at: datetime
    created_sequence: int
    delivery: Literal["followup", "steer"] = "followup"
    applied_step: int | None = None
    discarded: bool = False
    map_context: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ReducedSession:
    session_id: str
    user_messages: tuple[ReducedUserMessage, ...]
    runs: tuple[ReducedRun, ...]
    next_step: tuple[str, ...] = ()
