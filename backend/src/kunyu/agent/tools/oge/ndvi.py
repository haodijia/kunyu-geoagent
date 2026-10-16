"""NDVI-specific inputs, approval and submission for the shared service tool."""

from collections.abc import Mapping

from pydantic import Field, JsonValue

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
from kunyu.domain.analysis import AnalysisError, AnalysisJob
from kunyu.domain.map_context import ImageSelectionReference, TurnMapContext
from kunyu.persistence.maps import MapRepository


class NdviArguments(ToolArguments):
    image_selection: ImageSelectionReference | None = Field(
        description="Exact selected candidate_set_id and image_id; null only for an explicitly requested service-default demonstration."
    )


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
                else "Calculate NDVI for the frozen imagery input through OGE.",
                side_effect="Creates a persistent local analysis job using recorded data; no remote calculation is submitted."
                if replay
                else "Submits one remote OGE computation and records its job identity.",
            ),
            jobs,
            scopes,
        )

    def _frozen_selection(self) -> ImageSelectionReference | None:
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
        return TurnMapContext.model_validate(frozen_map).image_selection

    def _parameters(
        self, session_id: str, arguments: NdviArguments
    ) -> dict[str, JsonValue]:
        selection = arguments.image_selection
        if selection is None:
            if (
                self._frozen_selection() is not None
                or self._maps.image_selection(session_id) is not None
            ):
                raise ToolExecutionError(
                    "An image is selected. Supply its image_selection; service defaults cannot replace it.",
                    code="OGE_IMAGE_INPUT_REQUIRED",
                )
            return {"input_mode": "service_defaults"}
        frozen = self._frozen_selection()
        if (
            frozen is not None
            and frozen != selection
            and not self._maps.selected_by_run(session_id, self._run_id, selection)
        ):
            raise ToolExecutionError(
                "The requested image differs from the user's frozen selection.",
                code="OGE_IMAGE_SELECTION_MISMATCH",
            )
        candidates = self._maps.imagery.get(session_id, selection.candidate_set_id)
        image = next(
            (item for item in candidates.images if item.imageId == selection.image_id),
            None,
        )
        if image is None:
            raise ToolExecutionError(
                "The selected image is not in this session's candidate set.",
                code="INVALID_IMAGE",
            )
        if (
            image.productName not in self._service.gateway.selected_image_products
            or not image.imageIdentification.startswith("LC08_")
        ):
            raise ToolExecutionError(
                "The verified NDVI GP script uses Landsat 8 B5/B4 and currently supports LC08_C02_L1 only. This product requires a different verified service.",
                code="OGE_NDVI_PRODUCT_UNSUPPORTED",
            )
        if self._service.gateway.mode != "live":
            raise ToolExecutionError(
                "Selected-image NDVI requires live execution. The fixed recording cannot analyze this selection.",
                code="OGE_LIVE_REQUIRED",
            )
        return {
            "input_mode": "selected_image",
            "image_selection": selection.model_dump(mode="json"),
            "coverageID": image.imageIdentification,
            "productID": image.productName,
            "nir_band": "B5",
            "red_band": "B4",
        }

    def validate(self, arguments: object) -> Mapping[str, object]:
        value = super().validate(arguments)
        try:
            self._parameters(
                load_source(self._contexts, self._run_id).session.id,
                NdviArguments.model_validate(value),
            )
        except (ToolExecutionError, AnalysisError) as error:
            raise ToolValidationError(str(error)) from None
        return value

    async def _submit(
        self, call: ToolCall, session_id: str, arguments: NdviArguments
    ) -> AnalysisJob:
        parameters = self._parameters(session_id, arguments)
        return await self._service.submit(
            session_id, call.run_id, call.call_id, parameters
        )
