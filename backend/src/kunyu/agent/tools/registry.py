"""Explicit tool construction, write handlers and risk-based policy."""

from collections.abc import Callable
from dataclasses import dataclass
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
from kunyu.agent.scope import Context, ScopedEntries


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


@dataclass(frozen=True, slots=True)
class ToolRegistration:
    build: Callable[[str], Tool]
    write_handler: ConfirmedWriteHandler | None = None


class ToolRegistryFactory:
    def __init__(
        self,
        resolve_scope: Callable[[str], Context],
    ) -> None:
        self._resolve_scope = resolve_scope
        self._entries: ScopedEntries[ToolRegistration] = ScopedEntries()

    def register(
        self, owner: Context, name: str, registration: ToolRegistration
    ) -> None:
        self._entries.register(owner, name, registration)

    def for_run(self, run_id: str) -> ToolRegistry:
        entries = self._entries.view(self._resolve_scope(run_id))
        tools = []
        for name, entry in entries.items():
            tool = entry.build(run_id)
            if tool.spec.name != name:
                raise ToolExecutionError(
                    f"Tool registration '{name}' has a mismatched name."
                )
            tools.append(tool)
        registry = ToolRegistry(tuple(tools))
        for spec in registry.specs:
            if spec.risk_level is ToolRiskLevel.L2:
                self.require_write_handler(spec.name, run_id)
        return registry

    def require_write_handler(self, name: str, run_id: str) -> ConfirmedWriteHandler:
        entry = self._entries.view(self._resolve_scope(run_id)).get(name)
        if entry is None or entry.write_handler is None:
            raise ToolExecutionError(
                f"Tool '{name}' has no confirmed local write handler."
            )
        return entry.write_handler


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
