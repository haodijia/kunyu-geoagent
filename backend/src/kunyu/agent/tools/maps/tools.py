"""Map tools read and mutate only the calling session's typed map objects."""

from collections.abc import Mapping
from typing import Annotated
from uuid import uuid4

from pydantic import Field, model_validator

from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.input_content import ImageInputBlock
from kunyu.agent.runtime.contracts.models import ModelAdapterError
from kunyu.agent.runtime.contracts.tools import (
    BaseTool,
    ToolCall,
    ToolExecutionError,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.outputs.maps import COMPARISON, CONTEXT, PRESENT, STYLE
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    tool_result,
    validate_arguments,
    validate_model,
)
from kunyu.application.analysis.map_capture import MapCaptureError, MapCaptureService
from kunyu.application.conversation.attachment_preparation import normalize_image
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.conversation.attachments import (
    AttachmentError,
    ImageAttachment,
    PreparedAttachment,
    ToolImageProducer,
    attachment_path,
)
from kunyu.domain.geospatial.analysis import AnalysisError, LayerStyleWrite
from kunyu.domain.geospatial.raster import RasterReference
from kunyu.domain.models.model_images import ModelImageInput
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.filesystem.operation import filesystem_operation
from kunyu.integrations.model.request_images import prepare_image
from kunyu.persistence.conversation.attachments import SQLAlchemyAttachmentStore
from kunyu.persistence.geospatial.maps import MapRepository


class ContextArguments(ToolArguments):
    pass


class PresentArguments(ToolArguments):
    rasters: list[RasterReference] | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        description="Raster results and explicit view IDs to show. Supply rasters or image_ids, exclusively.",
    )
    image_ids: list[Annotated[int, Field(gt=0)]] | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        description="Image IDs from search results to add as layers. Supply image_ids or rasters, exclusively.",
    )
    open_map: bool = True
    focus: bool = True

    @model_validator(mode="after")
    def one_source(self):
        if (self.image_ids is None) == (self.rasters is None):
            raise ValueError("Supply exactly one of image_ids or rasters.")
        ids = (
            self.image_ids
            if self.image_ids is not None
            else [(r.output_id, r.view_id) for r in self.rasters]
        )
        if len(set(ids)) != len(ids):
            raise ValueError("Resource IDs must be unique.")
        return self


class StyleArguments(LayerStyleWrite, ToolArguments):
    layer_id: str = Field(min_length=1, max_length=64)


class ComparisonArguments(ToolArguments):
    layer_ids: list[Annotated[str, Field(min_length=1, max_length=64)]] | None = Field(
        min_length=2, max_length=2
    )
    open_map: bool = True

    @model_validator(mode="after")
    def distinct_layers(self):
        if self.layer_ids is not None and self.layer_ids[0] == self.layer_ids[1]:
            raise ValueError("Comparison requires two distinct layers.")
        return self


class MapTool(BaseTool):
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        maps: MapRepository,
        captures: MapCaptureService,
        attachments: SQLAlchemyAttachmentStore,
        *,
        name: str,
    ) -> None:
        self.output_contract = {
            "map_get_context": CONTEXT,
            "map_present": PRESENT,
            "map_set_layer_style": STYLE,
            "map_compare": COMPARISON,
        }[name]
        self._run_id, self._contexts, self._maps = run_id, contexts, maps
        self._captures, self._attachments = captures, attachments
        self._arguments = {
            "map_get_context": ContextArguments,
            "map_set_layer_style": StyleArguments,
            "map_present": PresentArguments,
            "map_compare": ComparisonArguments,
        }[name]
        self.spec = ToolSpec(
            name=name,
            description=tool_description(name),
            parameters=self._arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0
            if name == "map_get_context"
            else ToolRiskLevel.L1,
            execution="parallel" if name == "map_get_context" else "exclusive",
            presentation="search" if name == "map_get_context" else "write",
            timeout_ms=30_000 if name == "map_get_context" else None,
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        if self.spec.name == "map_set_layer_style":
            return validate_model(
                self.spec.name, self._arguments, arguments
            ).model_dump(exclude_none=True)
        return validate_arguments(self.spec.name, self._arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        args = validate_model(self.spec.name, self._arguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        session_id = source.session.id
        try:
            if self.spec.name == "map_get_context":
                snapshot = self._contexts.get_request_snapshot(self._run_id)
                if snapshot is None:
                    raise ToolExecutionError(
                        "The calling model route has no committed request."
                    )
                image = (
                    await self._screenshot(call, session_id, snapshot.image_input)
                    if snapshot.image_input.enabled
                    else None
                )
                value = {
                    "layers": [
                        layer.model_dump(mode="json")
                        for layer in self._maps.layers(session_id)
                    ],
                    "rendering": self._captures.status(session_id),
                }
                current = {
                    (layer["id"], layer["revision"]) for layer in value["layers"]
                }
                reported = {
                    (layer["layer_id"], layer["revision"])
                    for layer in value["rendering"]["layers"]
                }
                if value["rendering"]["state"] == "ready" and current != reported:
                    value["rendering"]["state"] = "loading"
                    value["rendering"]["error"] = (
                        "The client has not confirmed the current layer revisions."
                    )
                if image is not None:
                    value["screenshot_path"] = attachment_path(image)
                    result = tool_result(value)
                    return ToolResult(
                        content=(*result.content, ImageInputBlock(attachment=image)),
                        result=result.result,
                    )
            elif self.spec.name == "map_present":
                layers = self._maps.present(
                    session_id,
                    call.call_id,
                    image_ids=args.image_ids,
                    rasters=args.rasters,
                )
                return tool_result(
                    {"layers": [layer.model_dump(mode="json") for layer in layers]},
                    max_bytes=1024 * 1024,
                )
            elif self.spec.name == "map_compare":
                layers = {layer.id: layer for layer in self._maps.layers(session_id)}
                if args.layer_ids is not None:
                    for layer_id in args.layer_ids:
                        layer = layers.get(layer_id)
                        if layer is None or layer.bounds is None:
                            raise ToolExecutionError(
                                "Comparison requires two spatially located layers from this session.",
                                code="INVALID_COMPARISON_LAYERS",
                            )
                value = args.model_dump(mode="json")
            else:
                value = self._maps.style(
                    session_id,
                    args.layer_id,
                    LayerStyleWrite(
                        **args.model_dump(exclude={"layer_id"}, exclude_none=True)
                    ),
                ).model_dump(mode="json")
        except AnalysisError as error:
            raise ToolExecutionError(str(error), code=error.code) from None
        return tool_result(value)

    async def _screenshot(
        self, call: ToolCall, session_id: str, policy: ModelImageInput
    ) -> ImageAttachment:
        try:
            raw = await self._captures.capture(session_id, call.call_id)

            def publish(cancelled):
                check_cancelled(cancelled, "map screenshot")
                ref, data = normalize_image(str(uuid4()), "map.png", "image/png", raw)
                ref = ref.model_copy(
                    update={
                        "producer": ToolImageProducer(
                            run_id=call.run_id, tool_call_id=call.call_id
                        )
                    }
                )
                prepare_image(ref, data, policy)
                check_cancelled(cancelled, "publish map screenshot")
                return self._attachments.save_batch(
                    session_id, (PreparedAttachment(ref, data, raw, "image/png"),)
                )[0]

            return await filesystem_operation(publish)
        except (MapCaptureError, AttachmentError, ModelAdapterError) as error:
            raise ToolExecutionError(
                str(error),
                code=error.code.value
                if isinstance(error, ModelAdapterError)
                else error.code,
            ) from error
