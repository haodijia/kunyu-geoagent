"""Validated tool call and policy boundaries."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Literal, Protocol

from pydantic import JsonValue

from kunyu.agent.runtime.tool_content import ToolContent

if TYPE_CHECKING:
    from kunyu.agent.runtime.events import EventDraft


class ToolRiskLevel(Enum):
    L0 = "l0"
    L1 = "l1"
    L2 = "l2"


@dataclass(frozen=True)
class ToolSchema:
    name: str
    description: str
    parameters: Mapping[str, object]


@dataclass(frozen=True, slots=True)
class ToolApproval:
    execution: Literal["transaction", "tool"]
    summary: str
    side_effect: str
    binding: str | None = None

    def __post_init__(self) -> None:
        if (
            self.execution not in {"transaction", "tool"}
            or not isinstance(self.summary, str)
            or not self.summary.strip()
            or not isinstance(self.side_effect, str)
            or not self.side_effect.strip()
        ):
            raise ValueError(
                "Tool approval requires an execution mode and reviewable effects."
            )
        if self.binding is not None and (
            not isinstance(self.binding, str)
            or not self.binding.strip()
            or len(self.binding) > 1000
        ):
            raise ValueError(
                "Approval binding must be nonempty text up to 1000 characters."
            )
        if self.execution == "tool" and self.binding is None:
            raise ValueError(
                "Deferred tool approval requires an exact implementation binding."
            )


@dataclass(frozen=True)
class ToolSpec(ToolSchema):
    risk_level: ToolRiskLevel
    execution: Literal["parallel", "exclusive"]
    presentation: Literal["context", "search", "write"]
    approval: ToolApproval | None = None
    interaction: bool = False
    timeout_ms: int | None = None
    timeout_error_code: str = "TOOL_TIMEOUT"

    def __post_init__(self) -> None:
        if (self.risk_level is ToolRiskLevel.L2) != (self.approval is not None):
            raise ValueError("Exactly L2 tools require an explicit approval contract.")
        if self.interaction and (
            self.execution != "exclusive" or self.risk_level is not ToolRiskLevel.L0
        ):
            raise ValueError("Human interaction tools must be exclusive L0 tools.")
        if self.timeout_ms is not None and (
            type(self.timeout_ms) is not int or self.timeout_ms <= 0
        ):
            raise ValueError("A declared tool timeout must be a positive integer.")
        if not self.timeout_error_code:
            raise ValueError("A tool timeout requires an error code.")


@dataclass(frozen=True)
class ToolCall:
    run_id: str
    call_id: str
    name: str
    arguments: Mapping[str, object]


@dataclass(frozen=True)
class ToolResult:
    content: ToolContent
    result: JsonValue
    events: tuple[EventDraft, ...] = ()


class ToolRegistryError(RuntimeError):
    """A fixed tool registry is invalid or cannot resolve a requested tool."""


class ToolNotFoundError(ToolRegistryError):
    def __init__(self, name: str) -> None:
        self.name = name
        super().__init__(f"Tool '{name}' is not registered.")


class ToolValidationError(ValueError):
    """Model-supplied tool arguments do not match the declared schema."""


class ToolExecutionError(RuntimeError):
    """A registered tool could not produce a valid result."""

    def __init__(self, message: str, *, code: str = "TOOL_EXECUTION_FAILED") -> None:
        self.code = code
        super().__init__(message)


class ToolConfirmationRequiredError(ToolExecutionError):
    """A write tool reached execution without an approved confirmation."""


class PolicyDecision(Enum):
    ALLOW = "allow"
    CONFIRM = "confirm"
    DENY = "deny"
    DO_NOT_REPEAT = "do-not-repeat"
    CONTRACT_CHANGED = "contract-changed"


class PolicyGate(Protocol):
    def decide(self, call: ToolCall) -> PolicyDecision: ...

    def risk_level(self, call: ToolCall) -> ToolRiskLevel: ...


class Tool(Protocol):
    @property
    def spec(self) -> ToolSpec: ...

    def validate(self, arguments: object) -> Mapping[str, object]: ...

    async def execute(self, call: ToolCall) -> ToolResult: ...


class ToolRegistry:
    """Immutable-by-convention exact-name registry for one run's bound tools."""

    def __init__(self, tools: tuple[Tool, ...]) -> None:
        registered: dict[str, Tool] = {}
        for tool in tools:
            name = tool.spec.name
            if not name:
                raise ToolRegistryError("Tool names must not be empty.")
            if name in registered:
                raise ToolRegistryError(f"Tool '{name}' is registered more than once.")
            registered[name] = tool
        self._tools = registered

    @property
    def specs(self) -> tuple[ToolSpec, ...]:
        return tuple(tool.spec for tool in self._tools.values())

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def require(self, name: str) -> Tool:
        tool = self.get(name)
        if tool is None:
            raise ToolNotFoundError(name)
        return tool
