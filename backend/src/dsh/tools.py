"""Validated tool call and policy boundaries."""

from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from typing import Protocol


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: Mapping[str, object]


@dataclass(frozen=True)
class ToolCall:
    run_id: str
    call_id: str
    name: str
    arguments: Mapping[str, object]


@dataclass(frozen=True)
class ToolResult:
    content: str


class PolicyDecision(Enum):
    ALLOW = "allow"
    CONFIRM = "confirm"
    DENY = "deny"


class PolicyGate(Protocol):
    def decide(self, call: ToolCall) -> PolicyDecision: ...


class Tool(Protocol):
    @property
    def spec(self) -> ToolSpec: ...

    def validate(self, arguments: object) -> Mapping[str, object]: ...

    async def execute(self, call: ToolCall) -> ToolResult: ...
