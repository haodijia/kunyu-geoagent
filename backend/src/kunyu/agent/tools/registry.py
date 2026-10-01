"""Explicit tool construction, write handlers and risk-based policy."""

from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Protocol

from pydantic import JsonValue
from sqlalchemy.orm import Session

from kunyu.agent.runtime.tools import (
    PolicyDecision,
    Tool,
    ToolCall,
    ToolExecutionError,
    ToolNotFoundError,
    ToolRegistry,
    ToolRiskLevel,
)


class ConfirmedWriteHandler(Protocol):
    @property
    def summary(self) -> str: ...

    @property
    def side_effect(self) -> str: ...

    def execute(
        self,
        database_session: Session,
        workspace_id: str,
        call: ToolCall,
        now: datetime,
    ) -> dict[str, JsonValue]: ...


class ToolRegistryFactory:
    def __init__(
        self,
        builders: tuple[Callable[[str], Tool], ...],
        write_handlers: Mapping[str, ConfirmedWriteHandler],
    ) -> None:
        self._builders = builders
        self._write_handlers = dict(write_handlers)

    def for_run(self, run_id: str) -> ToolRegistry:
        registry = ToolRegistry(tuple(build(run_id) for build in self._builders))
        for spec in registry.specs:
            if spec.risk_level is ToolRiskLevel.L2:
                self.require_write_handler(spec.name)
        return registry

    def require_write_handler(self, name: str) -> ConfirmedWriteHandler:
        if name not in self._write_handlers:
            raise ToolExecutionError(
                f"Tool '{name}' has no confirmed local write handler."
            )
        return self._write_handlers[name]


class ToolPolicyGate:
    def __init__(self, registries: ToolRegistryFactory) -> None:
        self._registries = registries

    def risk_level(self, call: ToolCall) -> ToolRiskLevel:
        try:
            tool = self._registries.for_run(call.run_id).require(call.name)
        except ToolNotFoundError as error:
            raise ToolExecutionError(
                f"Tool '{call.name}' is not authorized."
            ) from error
        return tool.spec.risk_level

    def decide(self, call: ToolCall) -> PolicyDecision:
        try:
            risk_level = self.risk_level(call)
        except ToolExecutionError:
            return PolicyDecision.DENY
        if risk_level is ToolRiskLevel.L0:
            return PolicyDecision.ALLOW
        if risk_level is ToolRiskLevel.L2:
            return PolicyDecision.CONFIRM
        raise AssertionError("Unhandled tool risk level.")
