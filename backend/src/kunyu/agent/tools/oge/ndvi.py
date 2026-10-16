"""NDVI-specific inputs, approval and submission for the shared service tool."""

from collections.abc import Mapping

from kunyu.agent.jobs import JobRegistry
from kunyu.agent.runtime.tools import (
    ToolApproval,
    ToolCall,
    ToolExecutionError,
    ToolValidationError,
)
from kunyu.agent.scope import AgentScopes
from kunyu.agent.tools.oge.service import OgeServiceTool
from kunyu.agent.tools.shared import ToolArguments, load_source
from kunyu.application.analysis import AnalysisService
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.analysis import AnalysisJob
from kunyu.domain.map_context import TurnMapContext
from kunyu.persistence.maps import MapRepository


class NdviArguments(ToolArguments):
    pass


class NdviTool(OgeServiceTool[NdviArguments]):
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        service: AnalysisService,
        jobs: JobRegistry,
        scopes: AgentScopes,
        maps: MapRepository,
    ) -> None:
        self._maps = maps
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
                summary="Create an NDVI recorded demonstration."
                if replay
                else "Calculate default NDVI through OGE.",
                side_effect="Creates a persistent local analysis job using recorded data; no remote calculation is submitted."
                if replay
                else "Submits one remote OGE computation and records its job identity.",
            ),
            jobs,
            scopes,
        )

    def _require_defaults(self, session_id: str) -> None:
        source = load_source(self._contexts, self._run_id)
        frozen_map = source.run.map_snapshot
        for message in reversed(source.reduced_session.user_messages):
            if (
                message.run_id == self._run_id
                and message.source == "user"
                and message.delivery == "steer"
                and not message.discarded
                and message.applied_step is not None
                and message.applied_step <= source.run.step
            ):
                frozen_map = message.map_context
                break
        if TurnMapContext.model_validate(
            frozen_map
        ).image_selection is not None or self._maps.has_image_selection(session_id):
            raise ToolExecutionError(
                "Selected-image NDVI input is not verified for this service. No computation was submitted. Clear the selection only if the user explicitly requests the service-default demonstration.",
                code="OGE_IMAGE_INPUT_UNVERIFIED",
            )

    def validate(self, arguments: object) -> Mapping[str, object]:
        value = super().validate(arguments)
        try:
            self._require_defaults(load_source(self._contexts, self._run_id).session.id)
        except ToolExecutionError as error:
            raise ToolValidationError(str(error)) from None
        return value

    async def _submit(
        self, call: ToolCall, session_id: str, arguments: NdviArguments
    ) -> AnalysisJob:
        self._require_defaults(session_id)
        return await self._service.submit(session_id, call.run_id, call.call_id)
