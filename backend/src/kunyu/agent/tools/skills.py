"""Run-bound skill instruction and text resource loaders."""

import asyncio
from collections.abc import Mapping
from typing import Annotated

from pydantic import StringConstraints

from kunyu.agent.runtime.tools import ToolCall, ToolResult, ToolRiskLevel, ToolSpec
from kunyu.agent.scope import AgentScopes
from kunyu.agent.skills.filesystem import read_resource
from kunyu.agent.skills.registry import SKILL_NAME_PATTERN, SkillRegistry
from kunyu.agent.skills.render import render_skill
from kunyu.agent.tools.shared import (
    ToolArguments,
    encode_json,
    load_source,
    require_bound_call,
    validate_arguments,
    validate_model,
)
from kunyu.domain.agent_context import RunContextRepository


class SkillArguments(ToolArguments):
    name: Annotated[str, StringConstraints(pattern=SKILL_NAME_PATTERN, max_length=200)]


class SkillResourceArguments(SkillArguments):
    path: Annotated[str, StringConstraints(min_length=1, max_length=1000)]


class SkillTool:
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        skills: SkillRegistry,
        scopes: AgentScopes,
        *,
        resource: bool,
    ) -> None:
        self._run_id = run_id
        self._contexts = contexts
        self._skills = skills
        self._scopes = scopes
        self._resource = resource
        self._arguments = SkillResourceArguments if resource else SkillArguments
        self._spec = ToolSpec(
            name="skill_resource" if resource else "skill",
            description=(
                "Read one explicitly referenced UTF-8 resource using a relative path "
                "inside an available skill. This does not execute scripts."
                if resource
                else "Load the complete instructions of an available skill by its exact "
                "catalog name before acting on a task that names or matches it."
            ),
            parameters=self._arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="context",
        )

    @property
    def spec(self) -> ToolSpec:
        return self._spec

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self._arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        arguments = validate_model(self.spec.name, self._arguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        scope = self._scopes.for_session(source.session.id)
        user_authorized = self._resource and any(
            item.producer == "skill-invocation"
            and item.metadata["run_id"] == self._run_id
            and item.metadata["name"] == arguments.name
            for item in source.injected_context
        )
        skill = await self._skills.get(
            scope,
            arguments.name,
            workspace_id=source.workspace.id,
            invocation="user" if user_authorized else "model",
        )
        if self._resource:
            if not isinstance(arguments, SkillResourceArguments):
                raise TypeError("Skill resource arguments are required.")
            content = await asyncio.to_thread(
                read_resource, skill.summary, arguments.path
            )
        else:
            content = render_skill(skill)
        scope.assert_active()
        return ToolResult(
            encode_json(
                {
                    "name": skill.summary.name,
                    "source": skill.summary.source,
                    "resource_base": skill.summary.resource_base,
                    "content": content,
                }
            ).decode("utf-8")
        )
