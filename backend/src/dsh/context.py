"""Replayable model context and memory access boundaries."""

from dataclasses import dataclass
from typing import Protocol

from dsh.models import ModelMessage


@dataclass(frozen=True)
class AgentContext:
    messages: tuple[ModelMessage, ...]


class ContextProvider(Protocol):
    async def build(self, run_id: str) -> AgentContext: ...


class Memory(Protocol):
    async def search(self, scope_id: str, query: str, limit: int) -> tuple[str, ...]: ...
