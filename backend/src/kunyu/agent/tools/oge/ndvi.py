"""NDVI-specific inputs, approval and submission for the shared service tool."""

from kunyu.agent.runtime.tools import ToolApproval, ToolCall
from kunyu.agent.tools.oge.service import OgeServiceTool
from kunyu.agent.tools.shared import ToolArguments
from kunyu.application.analysis import AnalysisService
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.analysis import AnalysisJob


class NdviArguments(ToolArguments):
    pass


class NdviTool(OgeServiceTool[NdviArguments]):
    def __init__(
        self, run_id: str, contexts: RunContextRepository, service: AnalysisService
    ) -> None:
        replay = service.gateway.mode == "replay"
        super().__init__(
            run_id,
            contexts,
            service,
            "oge_calculate_ndvi",
            NdviArguments,
            ToolApproval(
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

    async def _submit(
        self, call: ToolCall, session_id: str, arguments: NdviArguments
    ) -> AnalysisJob:
        return await self._service.submit(session_id, call.run_id, call.call_id)
