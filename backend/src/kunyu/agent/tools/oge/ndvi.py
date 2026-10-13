"""NDVI submission participates in the existing deferred approval contract."""

from collections.abc import Mapping

from kunyu.agent.prompt_files import tool_description
from kunyu.agent.runtime.tools import (
    ToolApproval,
    ToolCall,
    ToolExecutionError,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    tool_result,
    validate_arguments,
)
from kunyu.application.analysis import AnalysisService
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.analysis import AnalysisError
from kunyu.domain.oge import OgeError


class NdviArguments(ToolArguments):
    pass


class NdviTool:
    def __init__(
        self, run_id: str, contexts: RunContextRepository, service: AnalysisService
    ) -> None:
        self._run_id, self._contexts, self._service = run_id, contexts, service
        replay = service.gateway.mode == "replay"
        self.spec = ToolSpec(
            name="oge_calculate_ndvi",
            description=tool_description("oge_calculate_ndvi"),
            parameters=NdviArguments.model_json_schema(),
            risk_level=ToolRiskLevel.L2,
            execution="exclusive",
            presentation="write",
            timeout_ms=30_000,
            approval=ToolApproval(
                execution="tool",
                binding=service.binding,
                summary="Create an NDVI recorded demonstration."
                if replay
                else "Submit one default NDVI calculation to OGE.",
                side_effect="Creates a persistent local analysis job using recorded data; no remote calculation is submitted."
                if replay
                else "Submits one remote OGE computation and records its job identity.",
            ),
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, NdviArguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        self.validate(call.arguments)
        source = load_source(self._contexts, self._run_id)
        try:
            job = await self._service.submit(
                source.session.id, call.run_id, call.call_id
            )
        except (AnalysisError, OgeError) as error:
            raise ToolExecutionError(str(error), code=error.code) from None
        return tool_result(
            {
                "analysis_job_id": job.id,
                "job": job.model_dump(mode="json"),
                "next_action": "Use oge_wait_job or oge_get_job; the background supervisor owns status reads.",
            }
        )
