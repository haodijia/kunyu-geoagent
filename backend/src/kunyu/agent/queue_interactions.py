"""Scope-owned, expiring holds for automatic input claiming during UI interaction."""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass

from kunyu.agent.scope import Context


class QueueInteractionConflictError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class QueueInteractionConfig:
    lease_milliseconds: int = 30_000
    max_interactions_per_session: int = 8

    def __post_init__(self) -> None:
        if self.lease_milliseconds <= 0 or self.max_interactions_per_session <= 0:
            raise ValueError("Queue interaction limits must be positive.")


@dataclass(slots=True)
class _Interaction:
    owner: Context
    timer: asyncio.TimerHandle
    detach: Callable[[], None]


class QueueInteractions:
    def __init__(
        self, config: QueueInteractionConfig, wake: Callable[[], None]
    ) -> None:
        self.config = config
        self._wake = wake
        self._entries: dict[tuple[str, str], _Interaction] = {}

    @property
    def held_sessions(self) -> frozenset[str]:
        return frozenset(session_id for session_id, _ in self._entries)

    def acquire(self, owner: Context, session_id: str, interaction_id: str) -> int:
        owner.assert_active()
        key = (session_id, interaction_id)
        if key in self._entries:
            return self.renew(owner, session_id, interaction_id)
        if (
            sum(session == session_id for session, _ in self._entries)
            >= self.config.max_interactions_per_session
        ):
            raise QueueInteractionConflictError(
                "Too many queue interactions for this session."
            )
        timer = self._timer(key)
        detach = owner.effect(lambda: self.release(session_id, interaction_id))
        self._entries[key] = _Interaction(owner, timer, detach)
        return self.config.lease_milliseconds

    def renew(self, owner: Context, session_id: str, interaction_id: str) -> int:
        owner.assert_active()
        key = (session_id, interaction_id)
        entry = self._entries.get(key)
        if entry is None or entry.owner is not owner:
            raise QueueInteractionConflictError(
                "The queue interaction is no longer active."
            )
        entry.timer.cancel()
        entry.timer = self._timer(key)
        return self.config.lease_milliseconds

    def release(self, session_id: str, interaction_id: str) -> None:
        entry = self._entries.pop((session_id, interaction_id), None)
        if entry is None:
            return
        entry.timer.cancel()
        entry.detach()
        self._wake()

    def close(self) -> None:
        for session_id, interaction_id in tuple(self._entries):
            self.release(session_id, interaction_id)

    def _timer(self, key: tuple[str, str]) -> asyncio.TimerHandle:
        return asyncio.get_running_loop().call_later(
            self.config.lease_milliseconds / 1_000, self.release, *key
        )
