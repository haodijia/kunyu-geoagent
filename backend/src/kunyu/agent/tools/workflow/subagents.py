"""Delegate a child conversation or deliver a message/interruption to it."""

from collections.abc import Mapping
from typing import Literal

from pydantic import Field

from kunyu.agent.orchestration.subagents import SubagentManager
from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.tools import (
    BaseTool,
    ToolCall,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.outputs.workflow import AGENT_CONTROL, DELEGATE
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    tool_result,
    validate_arguments,
    validate_model,
)


class DelegateArguments(ToolArguments):
    description: str = Field(min_length=1, max_length=200, pattern=r"\S")
    prompt: str = Field(min_length=1, max_length=32_768, pattern=r"\S")


class InterruptArguments(ToolArguments):
    agent_id: str = Field(min_length=1, max_length=64)


class MessageArguments(InterruptArguments):
    message: str = Field(min_length=1, max_length=30_000, pattern=r"\S")


class SubagentTool(BaseTool):
    def __init__(
        self,
        run_id: str,
        manager: SubagentManager,
        name: Literal["subagent", "send_message", "interrupt_agent"],
    ):
        self.output_contract = DELEGATE if name == "subagent" else AGENT_CONTROL
        self.run_id, self.manager, self.name = run_id, manager, name
        self.arguments = {
            "subagent": DelegateArguments,
            "send_message": MessageArguments,
            "interrupt_agent": InterruptArguments,
        }[name]
        self.spec = ToolSpec(
            name=name,
            description=tool_description(name),
            parameters=self.arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="context",
            timeout_ms=30_000,
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.name, self.arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self.run_id, self.name)
        args = validate_model(self.name, self.arguments, call.arguments)
        if self.name == "subagent":
            return tool_result({"agent_id": await self.manager.start(call)})
        if self.name == "send_message":
            return tool_result(
                {
                    "message_id": await self.manager.send_message(
                        call, args.agent_id, args.message
                    )
                }
            )
        source = load_source(self.manager.contexts, self.run_id)
        self.manager.interrupt(args.agent_id, source.session.id)
        return tool_result({"accepted": True})
