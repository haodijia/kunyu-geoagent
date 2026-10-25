"""Approved service producers register one session-owned background job."""

from collections.abc import Mapping

from pydantic import Field

from kunyu.agent.orchestration.analysis_jobs import AnalysisJobs
from kunyu.agent.orchestration.jobs import JobRegistry
from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.tools import (
    BaseTool,
    ToolApproval,
    ToolCall,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.outputs.oge import ANALYSIS
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
from kunyu.domain.geospatial.raster import RasterPresentation


class ExecuteCodeArguments(ToolArguments):
    title: str = Field(min_length=1, max_length=120)
    code: str = Field(
        min_length=1,
        max_length=12000,
        description="OGE Python SDK code that explicitly loads its inputs; compose operators then export exactly one Coverage with result.export(name).",
    )
    crs: str = Field(pattern=r"^EPSG:[0-9]{4,6}$")
    scale: float = Field(gt=0, le=100000, allow_inf_nan=False)
    presentation: RasterPresentation = Field(
        description="Describe every exported band in order and declare views with explicit band selections, styles and a default view. The same contract applies to any band count and RGB."
    )


class ExecuteCodeTool(BaseTool):
    output_contract = ANALYSIS

    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        service: AnalysisService,
        producer: AnalysisJobs,
        jobs: JobRegistry,
        *,
        wait_timeout_seconds: int = 120,
    ) -> None:
        self._run_id, self._contexts = run_id, contexts
        self._arguments = ExecuteCodeArguments
        self._wait_timeout_seconds = wait_timeout_seconds
        self._jobs, self._producer = jobs, producer
        self.spec = ToolSpec(
            name="oge_execute_code",
            description=tool_description("oge_execute_code"),
            parameters=ExecuteCodeArguments.model_json_schema(),
            risk_level=ToolRiskLevel.L2,
            execution="exclusive",
            presentation="write",
            timeout_ms=330_000,
            approval=ToolApproval(
                execution="tool",
                binding=service.binding,
                summary="Execute the approved OGE Python operator chain.",
                side_effect="Compiles remote code, submits one raster batch export and downloads the numeric GeoTIFF.",
            ),
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self._arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        arguments = validate_model(self.spec.name, self._arguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        job_id = self._producer.start(
            source.session.id,
            call,
            {
                "title": arguments.title,
                "script": arguments.code,
                "crs": arguments.crs,
                "scale": arguments.scale,
                "presentation": arguments.presentation.model_dump(mode="json"),
            },
        )
        return tool_result(
            await self._jobs.wait_and_read(
                job_id, source.session.id, self._wait_timeout_seconds
            )
        )
