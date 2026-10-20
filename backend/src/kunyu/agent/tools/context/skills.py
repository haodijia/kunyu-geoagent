"""Run-bound skill instruction and text resource loaders."""

from collections.abc import Mapping
from typing import Annotated

from pydantic import JsonValue, StringConstraints, TypeAdapter

from kunyu.agent.core.scope import AgentScopes
from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.content import TextBlock
from kunyu.agent.runtime.contracts.tools import (
    BaseTool,
    ToolCall,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.skills.definitions import SKILL_NAME_PATTERN
from kunyu.agent.skills.registry import SkillRegistry
from kunyu.agent.skills.render import render_skill
from kunyu.agent.tools.outputs.workflow import SKILL
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


class SkillTool(BaseTool):
    output_contract = SKILL

    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        skills: SkillRegistry,
        scopes: AgentScopes,
    ) -> None:
        self._run_id = run_id
        self._contexts = contexts
        self._skills = skills
        self._scopes = scopes
        self._arguments = SkillArguments
        self._spec = ToolSpec(
            name="skill",
            description=tool_description("skill"),
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
        skill = await self._skills.get(
            scope, arguments.name, workspace_id=source.workspace.id, invocation="model"
        )
        scope.assert_active()
        value = {
            "name": skill.summary.name,
            "source": skill.summary.source,
            "provider": skill.summary.provider,
            "resource_base": skill.summary.resource_base.model_dump(mode="json")
            if skill.summary.resource_base is not None
            else None,
            "content": skill.content,
        }
        return ToolResult(
            content=(TextBlock(text=render_skill(skill)),),
            result=TypeAdapter(JsonValue).validate_python(value),
        )
