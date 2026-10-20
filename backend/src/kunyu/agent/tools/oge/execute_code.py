"""Approved service producers register one session-owned background job."""

from collections.abc import Mapping

from pydantic import Field

from kunyu.agent.core.scope import AgentScopes
from kunyu.agent.orchestration.jobs import JobHandle, JobRegistry
from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.tools import (
    BaseTool,
    ToolApproval,
    ToolCall,
    ToolExecutionError,
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
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.oge import OgeError


class ExecuteCodeArguments(ToolArguments):
    title: str = Field(min_length=1, max_length=120)
    code: str = Field(
        min_length=1,
        max_length=12000,
        description="OGE Python SDK code that explicitly loads its inputs; compose operators then export exactly one Coverage with result.export(name).",
    )
    crs: str = Field(pattern=r"^EPSG:[0-9]{4,6}$")
    scale: float = Field(gt=0, le=100000, allow_inf_nan=False)


class ExecuteCodeTool(BaseTool):
    output_contract = ANALYSIS

    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        service: AnalysisService,
        jobs: JobRegistry,
        scopes: AgentScopes,
        *,
        wait_timeout_seconds: int = 120,
    ) -> None:
        self._run_id, self._contexts, self._service = run_id, contexts, service
        self._arguments = ExecuteCodeArguments
        self._wait_timeout_seconds = wait_timeout_seconds
        self._jobs, self._scopes = jobs, scopes
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
        try:
            job = await self._service.submit(
                source.session.id,
                call.run_id,
                call.call_id,
                {
                    "title": arguments.title,
                    "script": arguments.code,
                    "crs": arguments.crs,
                    "scale": arguments.scale,
                },
            )
        except (AnalysisError, OgeError) as error:
            raise ToolExecutionError(str(error), code=error.code) from None

        async def observe(handle: JobHandle):
            handle.append(str(job.parameters["log"]))
            completed, output = await self._service.wait_for_output(
                source.session.id,
                job.id,
                progress=lambda current: handle.progress(
                    current.state
                    if current.error_message is None
                    else f"{current.state}: {current.error_message}"
                ),
            )
            return {
                "analysis_job_id": job.id,
                "analysis_output_id": output.id,
                "job": {
                    "id": completed.id,
                    "state": completed.state,
                    "service": completed.service,
                },
                "output": {
                    "id": output.id,
                    "title": output.title,
                    "file_path": output.file_path,
                    "preview_path": output.preview_path,
                    "kind": output.kind,
                    "metadata": output.metadata,
                },
            }

        async def cancel_remote() -> None:
            raise ToolExecutionError(
                "The verified OGE API does not support cancellation. The remote calculation continues.",
                code="OGE_CANCEL_UNSUPPORTED",
            )

        background_id = self._jobs.start(
            source.session.id,
            self._scopes.for_session(source.session.id),
            "analysis",
            arguments.title,
            observe,
            job_id=job.id,
            call=call,
            cancel=cancel_remote,
        )
        return tool_result(
            {
                "analysis_job_id": job.id,
                **await self._jobs.wait_and_read(
                    background_id, source.session.id, self._wait_timeout_seconds
                ),
            }
        )
