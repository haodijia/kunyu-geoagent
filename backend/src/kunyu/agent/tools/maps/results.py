"""Read facts from existing results using the calling run's workspace scope."""

import logging
from collections.abc import Mapping
from typing import Annotated

from pydantic import Field, JsonValue

from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.tool_output import TextDisplay
from kunyu.agent.runtime.contracts.tools import (
    BaseTool,
    ToolCall,
    ToolExecutionError,
    ToolOutputContract,
    ToolRiskLevel,
    ToolSpec,
)
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
from kunyu.application.analysis.object_review import ObjectReviewService
from kunyu.application.analysis.results import ResultService
from kunyu.application.analysis.views import RasterViewService
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.conversation.attachments import attachment_path
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.field_observation import (
    FIELD_OBSERVATION,
    FieldObservation,
)
from kunyu.domain.geospatial.object_review import ReviewObjectReference
from kunyu.domain.geospatial.raster import RasterView
from kunyu.integrations.filesystem.operation import filesystem_operation


class ResultArguments(ToolArguments):
    output_id: str = Field(min_length=1, max_length=64)


class InfoArguments(ToolArguments):
    file_path: str = Field(min_length=1, max_length=4096)


class ReviewObjectArguments(ToolArguments):
    object: ReviewObjectReference


class RasterReadArguments(ResultArguments):
    view_id: str | None = Field(default=None, max_length=64)
    bands: list[Annotated[int, Field(ge=1)]] | None = Field(default=None, min_length=1)


class SampleArguments(RasterReadArguments):
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    latitude: float = Field(ge=-85, le=85, allow_inf_nan=False)


class StatisticsArguments(RasterReadArguments):
    geometry: dict[str, JsonValue]
    values: list[Annotated[float, Field(allow_inf_nan=False)]] | None = Field(
        default=None, min_length=1, max_length=32
    )


class ViewArguments(ResultArguments):
    expected_revision: int = Field(ge=1)
    views: list[RasterView] = Field(min_length=1)
    default_view: str = Field(min_length=1, max_length=64)


def display(result):
    return TextDisplay(
        summary=label("result_read"), text=object_result(result)["summary"]
    )


def compact_result(result):
    data = object_result(result)
    return compact(
        data["summary"],
        {key: value for key, value in data.items() if key != "source_metadata"},
    )


class ResultTool(BaseTool):
    output_contract = ToolOutputContract(agent_content, display, compact_result)

    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        service: ResultService,
        *,
        name: str,
    ) -> None:
        self.run_id, self.contexts, self.service = run_id, contexts, service
        self.arguments = {
            "result_get_info": InfoArguments,
            "result_set_views": ViewArguments,
            "map_sample_raster": SampleArguments,
            "map_region_statistics": StatisticsArguments,
            "result_review_object": ReviewObjectArguments,
        }[name]
        self.spec = ToolSpec(
            name=name,
            description=tool_description(name),
            parameters=self.arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L1
            if name == "result_set_views"
            else ToolRiskLevel.L0,
            execution="exclusive" if name == "result_set_views" else "parallel",
            presentation="write" if name == "result_set_views" else "search",
            timeout_ms=330_000 if name == "result_set_views" else 30_000,
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self.arguments, arguments)

    async def execute(self, call: ToolCall):
        require_bound_call(call, self.run_id, self.spec.name)
        args = validate_model(self.spec.name, self.arguments, call.arguments)
        source = load_source(self.contexts, self.run_id)
        workspace = source.session.workspace_id
        try:
            if call.name == "result_set_views":
                data = await filesystem_operation(
                    lambda cancelled: RasterViewService(
                        self.service.analysis.repository, self.service.analysis.raster
                    ).replace(
                        workspace,
                        args.output_id,
                        args.expected_revision,
                        args.views,
                        args.default_view,
                        cancelled,
                    )
                )
                summary = data["title"]
            elif call.name == "result_get_info":
                data = self.service.info(workspace, args.file_path)
                summary = data["title"]
            elif isinstance(args, ReviewObjectArguments):
                reference = args.object
                review = await filesystem_operation(
                    lambda cancelled: ObjectReviewService(
                        self.service.analysis
                    ).inspect(
                        workspace,
                        reference.output_id,
                        reference.dataset_id,
                        reference.feature_index,
                        cancelled,
                    )
                )
                observations = [
                    observation
                    for item in source.injected_context
                    if item.producer == FIELD_OBSERVATION
                    for observation in [FieldObservation.model_validate(item.metadata)]
                    if observation.reference == reference
                ]
                data = review.model_dump(mode="json")
                data["field_observation_count"] = len(observations)
                data["field_observations"] = [
                    {
                        "observed_at": observation.observed_at.isoformat(),
                        "note": observation.note,
                        "photo_paths": [
                            attachment_path(photo) for photo in observation.photos
                        ],
                    }
                    for observation in observations[-12:]
                ]
                summary = label(
                    "object_review", name=review.target.name or "未命名对象"
                )
            elif call.name == "map_sample_raster":
                data = await filesystem_operation(
                    lambda _: self.service.sample(
                        workspace,
                        args.output_id,
                        args.longitude,
                        args.latitude,
                        args.view_id,
                        args.bands,
                    )
                )
                summary = label("raster_sample", values=str(data["values"]))
            else:
                data = await filesystem_operation(
                    lambda _: self.service.statistics(
                        workspace,
                        args.output_id,
                        args.geometry,
                        args.values,
                        args.view_id,
                        args.bands,
                    )
                )
                summary = label(
                    "raster_statistics",
                    count=sum(b["valid_pixel_count"] for b in data["bands"]),
                )
            return tool_result({**data, "summary": summary}, max_bytes=256 * 1024)
        except OSError as error:
            logging.getLogger(__name__).exception("Result tool %s failed", call.name)
            if call.name == "result_set_views":
                raise ToolExecutionError(
                    "Could not save raster view files.", code="VIEW_SAVE_FAILED"
                ) from error
            raise ToolExecutionError(
                "Could not access result files.", code="RESULT_FILES_UNAVAILABLE"
            ) from error
        except AnalysisError as error:
            raise ToolExecutionError(str(error), code=error.code) from None
