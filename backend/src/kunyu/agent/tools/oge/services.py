"""Discover versioned GP contracts and invoke a published service once."""

from collections.abc import Mapping

from pydantic import Field, JsonValue

from kunyu.agent.orchestration.analysis_jobs import AnalysisJobs
from kunyu.agent.orchestration.jobs import JobRegistry
from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.tool_output import TextDisplay
from kunyu.agent.runtime.contracts.tools import (
    BaseTool,
    ToolApproval,
    ToolCall,
    ToolExecutionError,
    ToolOutputContract,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.outputs.oge import ANALYSIS
from kunyu.agent.tools.outputs.shared import (
    agent_content,
    compact,
    label,
    object_result,
)
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    tool_result,
    validate_arguments,
    validate_model,
)
from kunyu.application.analysis.analysis import AnalysisService
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.integrations.oge.service_catalog import (
    service_catalog,
    service_definition,
    service_parameters,
)


class ServiceDefinitionArguments(ToolArguments):
    service_name: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9_-]{1,80}$")


class ExecuteServiceArguments(ToolArguments):
    title: str = Field(min_length=1, max_length=120)
    service_name: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    parameters: dict[str, JsonValue] = Field(default_factory=dict)


def definition_display(result):
    data = object_result(result)
    rows = data.get("services", [data])
    return TextDisplay(
        summary=label("service_definition"),
        text="\n".join(r["name"] + " · " + r["title"] for r in rows),
    )


DEFINITION = ToolOutputContract(
    agent_content,
    definition_display,
    lambda result: compact(definition_display(result).summary, object_result(result)),
)


class PublishedServiceTool(BaseTool):
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        service: AnalysisService,
        producer: AnalysisJobs,
        jobs: JobRegistry,
        *,
        name: str,
    ):
        self._run_id, self._contexts = run_id, contexts
        self._producer, self._jobs = producer, jobs
        execute = name == "oge_execute_service"
        self._arguments = (
            ExecuteServiceArguments if execute else ServiceDefinitionArguments
        )
        self.output_contract = ANALYSIS if execute else DEFINITION
        self.spec = ToolSpec(
            name=name,
            description=tool_description(name),
            parameters=self._arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L2 if execute else ToolRiskLevel.L0,
            execution="exclusive" if execute else "parallel",
            presentation="write" if execute else "search",
            timeout_ms=330_000,
            approval=ToolApproval(
                execution="tool",
                binding=service.binding + ":published-service:v2",
                summary="Invoke the published OGE service with these parameters.",
                side_effect="Submits one GP job and collects its complete numeric products.",
            )
            if execute
            else None,
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self._arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        source = load_source(self._contexts, self._run_id)
        args = validate_model(self.spec.name, self._arguments, call.arguments)
        try:
            if isinstance(args, ServiceDefinitionArguments):
                return tool_result(
                    {"services": service_catalog()}
                    if args.service_name is None
                    else service_definition(args.service_name)
                )
            definition, parameters = service_parameters(
                args.service_name, args.parameters
            )
            job_id = self._producer.start(
                source.session.id,
                call,
                {
                    "title": args.title,
                    "service_name": args.service_name,
                    "service_version": definition["version"],
                    "arguments": parameters,
                    "products": definition["products"],
                    "limitations": definition["limitations"],
                },
            )
            return tool_result(
                await self._jobs.wait_and_read(job_id, source.session.id, 120)
            )
        except AnalysisError as error:
            raise ToolExecutionError(str(error), code=error.code) from error
