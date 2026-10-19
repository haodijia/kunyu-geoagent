"""Harness-compatible generic background output and control tools."""

from collections.abc import Mapping

from pydantic import Field

from kunyu.agent.orchestration.jobs import JobRegistry
from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.tools import (
    BaseTool,
    ToolCall,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.outputs.workflow import JOB, JOBS
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    tool_result,
    validate_arguments,
    validate_model,
)
from kunyu.domain.conversation.agent_context import RunContextRepository


class ListArguments(ToolArguments):
    pass


class JobArguments(ToolArguments):
    job_id: str = Field(min_length=1, max_length=128)


class OutputArguments(JobArguments):
    wait: bool = False
    timeout_ms: int = Field(default=30_000, ge=1)


class JobTool(BaseTool):
    def __init__(
        self, run_id: str, jobs: JobRegistry, contexts: RunContextRepository, name: str
    ) -> None:
        self.output_contract = {"job_list": JOBS, "job_output": JOB, "job_kill": JOB}[
            name
        ]
        self.run_id, self.jobs, self.contexts, self.name = run_id, jobs, contexts, name
        self.arguments = {
            "job_list": ListArguments,
            "job_output": OutputArguments,
            "job_kill": JobArguments,
        }[name]
        self.spec = ToolSpec(
            name=name,
            description=tool_description(name),
            parameters=self.arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="context",
            timeout_ms=610_000 if name == "job_output" else 30_000,
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.name, self.arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self.run_id, self.name)
        args = validate_model(self.name, self.arguments, call.arguments)
        owner = load_source(self.contexts, self.run_id).session.id
        if self.name == "job_list":
            return tool_result(self.jobs.list(owner))
        if self.name == "job_kill":
            return tool_result(await self.jobs.kill(args.job_id, owner))
        if args.wait:
            return tool_result(
                await self.jobs.wait_and_read(
                    args.job_id, owner, min(args.timeout_ms, 600_000) / 1_000
                )
            )
        return tool_result(self.jobs.read(args.job_id, owner))
