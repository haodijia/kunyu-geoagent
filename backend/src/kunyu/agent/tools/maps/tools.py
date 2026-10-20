"""Map tools read and mutate only the calling session's typed map objects."""

from collections.abc import Mapping
from typing import Annotated, Literal

from pydantic import Field, model_validator

from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.tools import (
    BaseTool,
    ToolCall,
    ToolExecutionError,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.outputs.maps import CONTEXT, PRESENT, STYLE
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    tool_result,
    validate_arguments,
    validate_model,
)
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.geospatial.analysis import AnalysisError, LayerStyleWrite
from kunyu.persistence.geospatial.maps import MapRepository


class ContextArguments(ToolArguments):
    pass


class PresentArguments(ToolArguments):
    target: Literal["images", "output"]
    reference_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        description="Analysis output ID. Only valid for target=output.",
    )
    image_ids: list[Annotated[int, Field(gt=0)]] | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        description="Image IDs from search results to add as layers. Only valid for target=images.",
    )
    open_map: bool = True
    focus: bool = True

    @model_validator(mode="after")
    def image_target(self):
        if self.target == "images":
            if self.image_ids is None or self.reference_id is not None:
                raise ValueError("Image presentation requires only image_ids.")
            if len(set(self.image_ids)) != len(self.image_ids):
                raise ValueError("Image IDs must be unique.")
        elif self.reference_id is None or self.image_ids is not None:
            raise ValueError("Output presentation requires only reference_id.")
        return self


class StyleArguments(ToolArguments):
    layer_id: str = Field(min_length=1, max_length=64)
    expected_revision: int = Field(ge=1)
    visible: bool
    opacity: float = Field(ge=0, le=1, allow_inf_nan=False)
    position: int = Field(ge=0, le=1000)


class MapTool(BaseTool):
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        maps: MapRepository,
        *,
        name: str,
    ) -> None:
        self.output_contract = {
            "map_get_context": CONTEXT,
            "map_present": PRESENT,
            "map_set_layer_style": STYLE,
        }[name]
        self._run_id, self._contexts, self._maps = run_id, contexts, maps
        self._arguments = (
            ContextArguments
            if name == "map_get_context"
            else StyleArguments
            if name == "map_set_layer_style"
            else PresentArguments
        )
        self.spec = ToolSpec(
            name=name,
            description=tool_description(name),
            parameters=self._arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0
            if name == "map_get_context"
            else ToolRiskLevel.L1,
            execution="parallel" if name == "map_get_context" else "exclusive",
            presentation="search" if name == "map_get_context" else "write",
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self._arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        args = validate_model(self.spec.name, self._arguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        session_id = source.session.id
        try:
            if self.spec.name == "map_get_context":
                value = {
                    "viewport": source.run.map_snapshot["viewport"],
                    "layers": [
                        layer.model_dump(mode="json")
                        for layer in self._maps.layers(session_id)
                    ],
                }
            elif self.spec.name == "map_present":
                presentation = self._maps.present(
                    session_id,
                    call.call_id,
                    args.target,
                    args.reference_id,
                    open_map=args.open_map,
                    focus=args.focus,
                    image_ids=args.image_ids,
                )
                value = {
                    "presentation": presentation.model_dump(mode="json"),
                }
            else:
                value = self._maps.style(
                    session_id,
                    args.layer_id,
                    LayerStyleWrite(**args.model_dump(exclude={"layer_id"})),
                ).model_dump(mode="json")
        except AnalysisError as error:
            raise ToolExecutionError(str(error), code=error.code) from None
        return tool_result(value)
