"""Explicit tool construction, write handlers and risk-based policy."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from pydantic import JsonValue
from sqlalchemy.orm import Session

from kunyu.agent.runtime.questions import QuestionAnswers, QuestionSet
from kunyu.agent.runtime.tools import (
    PolicyDecision,
    Tool,
    ToolCall,
    ToolExecutionError,
    ToolNotFoundError,
    ToolRegistry,
    ToolResult,
    ToolRiskLevel,
)
from kunyu.agent.scope import Context, ScopedEntries
from kunyu.domain.agent_context import RunContextRepository
from kunyu.persistence.commands import read_session_controls
from kunyu.persistence.database import Database


class QuestionHandler(Protocol):
    def questions(self, call: ToolCall) -> QuestionSet: ...
    def resolve(self, call: ToolCall, answer: QuestionAnswers | None) -> ToolResult: ...


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
    question_handler: QuestionHandler | None = None


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

    def registration_for_run(self, name: str, run_id: str) -> ToolRegistration | None:
        return self._entries.view(self._resolve_scope(run_id)).get(name)

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
            if spec.interaction:
                self.require_question_handler(spec.name, run_id)
            if spec.risk_level is ToolRiskLevel.L2:
                self.require_write_handler(spec.name, run_id)
        return registry

    def require_write_handler(self, name: str, run_id: str) -> ConfirmedWriteHandler:
        entry = self.registration_for_run(name, run_id)
        if entry is None or entry.write_handler is None:
            raise ToolExecutionError(
                f"Tool '{name}' has no confirmed local write handler."
            )
        return entry.write_handler

    def require_question_handler(self, name: str, run_id: str) -> QuestionHandler:
        entry = self.registration_for_run(name, run_id)
        if entry is None or entry.question_handler is None:
            raise ToolExecutionError(f"Tool '{name}' has no human-question handler.")
        return entry.question_handler


class ToolPolicyGate:
    def __init__(
        self,
        registries: ToolRegistryFactory,
        database: Database,
        contexts: RunContextRepository,
    ) -> None:
        self._registries = registries
        self._database = database
        self._contexts = contexts

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
        if risk_level in {ToolRiskLevel.L1, ToolRiskLevel.L2}:
            source = self._contexts.get(call.run_id)
            if source is None:
                raise ToolExecutionError("The tool run context is unavailable.")
            controls = read_session_controls(self._database, source.session.id)
            if controls.plan_active or controls.permission == "read-only":
                return PolicyDecision.DENY
            return (
                PolicyDecision.ALLOW
                if risk_level is ToolRiskLevel.L1
                else PolicyDecision.CONFIRM
            )
        raise AssertionError("Unhandled tool risk level.")
