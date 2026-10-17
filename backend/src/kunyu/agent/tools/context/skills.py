"""Run-bound skill instruction and text resource loaders."""

from collections.abc import Mapping
from typing import Annotated

from pydantic import JsonValue, StringConstraints, TypeAdapter

from kunyu.agent.core.scope import AgentScopes
from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.content import TextBlock
from kunyu.agent.runtime.contracts.tools import (
    ToolCall,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.skills.definitions import SKILL_NAME_PATTERN
from kunyu.agent.skills.registry import SkillRegistry
from kunyu.agent.skills.render import render_skill
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    validate_arguments,
    validate_model,
)
from kunyu.domain.conversation.agent_context import RunContextRepository


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
            description=tool_description("skill_resource" if resource else "skill"),
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
        if self._resource:
            if not isinstance(arguments, SkillResourceArguments):
                raise TypeError("Skill resource arguments are required.")
            skill, content = await self._skills.read_resource(
                scope,
                arguments.name,
                arguments.path,
                workspace_id=source.workspace.id,
                invocation="user" if user_authorized else "model",
            )
        else:
            skill = await self._skills.get(
                scope,
                arguments.name,
                workspace_id=source.workspace.id,
                invocation="model",
            )
            content = skill.content
        scope.assert_active()
        value = {
            "name": skill.summary.name,
            "source": skill.summary.source,
            "provider": skill.summary.provider,
            "resource_base": skill.summary.resource_base.model_dump(mode="json")
            if skill.summary.resource_base is not None
            else None,
            "content": content,
        }
        if self._resource:
            value["path"] = arguments.path
        return ToolResult(
            content=(
                TextBlock(text=content if self._resource else render_skill(skill)),
            ),
            result=TypeAdapter(JsonValue).validate_python(value),
        )
