"""Read facts from existing results using the calling run's workspace scope."""

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
from kunyu.application.analysis.results import ResultService
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.integrations.filesystem.operation import filesystem_operation


class ResultArguments(ToolArguments):
    output_id: str = Field(min_length=1, max_length=64)


class InfoArguments(ToolArguments):
    file_path: str = Field(min_length=1, max_length=4096)


class SampleArguments(ResultArguments):
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    latitude: float = Field(ge=-85, le=85, allow_inf_nan=False)


class StatisticsArguments(ResultArguments):
    geometry: dict[str, JsonValue]
    values: list[Annotated[float, Field(allow_inf_nan=False)]] | None = Field(
        default=None, min_length=1, max_length=32
    )


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
            "map_sample_raster": SampleArguments,
            "map_region_statistics": StatisticsArguments,
        }[name]
        self.spec = ToolSpec(
            name=name,
            description=tool_description(name),
            parameters=self.arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="search",
            timeout_ms=30_000,
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self.arguments, arguments)

    async def execute(self, call: ToolCall):
        require_bound_call(call, self.run_id, self.spec.name)
        args = validate_model(self.spec.name, self.arguments, call.arguments)
        workspace = load_source(self.contexts, self.run_id).session.workspace_id
        try:
            if call.name == "result_get_info":
                data = self.service.info(workspace, args.file_path)
                summary = data["title"]
            elif call.name == "map_sample_raster":
                data = await filesystem_operation(
                    lambda _: self.service.sample(
                        workspace, args.output_id, args.longitude, args.latitude
                    )
                )
                summary = label("raster_sample", values=str(data["values"]))
            else:
                data = await filesystem_operation(
                    lambda _: self.service.statistics(
                        workspace, args.output_id, args.geometry, args.values
                    )
                )
                summary = label("raster_statistics", count=data["valid_pixel_count"])
            return tool_result({**data, "summary": summary}, max_bytes=256 * 1024)
        except AnalysisError as error:
            raise ToolExecutionError(str(error), code=error.code) from None
