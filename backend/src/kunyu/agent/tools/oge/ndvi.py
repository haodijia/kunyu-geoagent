"""One approved NDVI call waits for a prepared output before succeeding."""

import asyncio
import logging
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

logger = logging.getLogger(__name__)
NDVI_WAIT_TIMEOUT_SECONDS = 15 * 60


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
            timeout_ms=(NDVI_WAIT_TIMEOUT_SECONDS + 30) * 1_000,
            timeout_error_code="ANALYSIS_WAIT_TIMEOUT",
            approval=ToolApproval(
                execution="tool",
                binding=service.binding,
                summary="Create an NDVI recorded demonstration and wait for its result."
                if replay
                else "Calculate default NDVI through OGE and wait for its result.",
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
        try:
            async with asyncio.timeout(NDVI_WAIT_TIMEOUT_SECONDS):
                job, output = await self._service.wait_for_output(
                    source.session.id, job.id
                )
        except TimeoutError:
            raise ToolExecutionError(
                f"Stopped waiting after {NDVI_WAIT_TIMEOUT_SECONDS} seconds for NDVI job {job.id}. The existing job remains supervised in the background; use oge_get_job to inspect it and do not submit a replacement calculation.",
                code="ANALYSIS_WAIT_TIMEOUT",
            ) from None
        except AnalysisError as error:
            raise ToolExecutionError(str(error), code=error.code) from None
        except asyncio.CancelledError:
            logger.info(
                "Stopped waiting for NDVI job %s; background supervision continues.",
                job.id,
            )
            raise
        return tool_result(
            {
                "analysis_job_id": job.id,
                "analysis_output_id": output.id,
                "job": job.model_dump(mode="json"),
                "output": output.model_dump(mode="json"),
            }
        )
