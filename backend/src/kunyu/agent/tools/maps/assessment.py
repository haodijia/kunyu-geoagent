"""Session-scoped research areas and numeric evidence tools share HTTP services."""

from collections.abc import Mapping

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
from kunyu.application.analysis.assessments import AssessmentService
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.assessment import AssessmentRequest, StudyAreaWrite
from kunyu.integrations.filesystem.operation import filesystem_operation


class EmptyArguments(ToolArguments):
    pass


class SampleArguments(ToolArguments):
    output_id: str = Field(min_length=1, max_length=64)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    latitude: float = Field(ge=-85, le=85, allow_inf_nan=False)


class StatisticsArguments(ToolArguments):
    output_id: str = Field(min_length=1, max_length=64)
    geometry: dict[str, JsonValue]


def evidence_display(result):
    return TextDisplay(
        summary=label("geospatial_evidence"), text=object_result(result)["summary"]
    )


def evidence_compact(result):
    return compact(label("geospatial_evidence"), object_result(result))


class AssessmentTool(BaseTool):
    output_contract = ToolOutputContract(
        agent_content, evidence_display, evidence_compact
    )

    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        service: AssessmentService,
        *,
        name: str,
    ) -> None:
        self.run_id, self.contexts, self.service = run_id, contexts, service
        self.arguments = {
            "study_area_get": EmptyArguments,
            "study_area_set": StudyAreaWrite,
            "map_sample_raster": SampleArguments,
            "map_region_statistics": StatisticsArguments,
            "assessment_create": AssessmentRequest,
        }[name]
        write = name in {"study_area_set", "assessment_create"}
        self.spec = ToolSpec(
            name=name,
            description=tool_description(name),
            parameters=self.arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L1 if write else ToolRiskLevel.L0,
            execution="exclusive" if write else "parallel",
            presentation="write" if write else "search",
            timeout_ms=180_000 if name == "assessment_create" else 30_000,
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self.arguments, arguments)

    async def execute(self, call: ToolCall):
        require_bound_call(call, self.run_id, self.spec.name)
        args = validate_model(self.spec.name, self.arguments, call.arguments)
        source = load_source(self.contexts, self.run_id)
        workspace = source.session.workspace_id
        try:
            if call.name == "study_area_get":
                area = self.service.repository.area(workspace)
                data = {"area": None if area is None else area.model_dump(mode="json")}
                summary = (
                    label("study_area_absent")
                    if area is None
                    else f"{area.name} · v{area.revision} · {area.area_m2 / 1_000_000:.3f} km²"
                )
            elif call.name == "study_area_set":
                area = self.service.save_area(workspace, args)
                data = {"area": area.model_dump(mode="json")}
                summary = f"{area.name} · v{area.revision} · {area.area_m2 / 1_000_000:.3f} km²"
            elif call.name == "map_sample_raster":
                data = await filesystem_operation(
                    lambda _: self.service.sample(
                        workspace, args.output_id, args.longitude, args.latitude
                    )
                )
                summary = label("raster_sample", values=str(data["values"]))
            elif call.name == "map_region_statistics":
                data = await filesystem_operation(
                    lambda _: self.service.statistics(
                        workspace, args.output_id, args.geometry
                    )
                )
                summary = label("raster_statistics", count=data["valid_pixel_count"])
            else:
                value = await filesystem_operation(
                    lambda cancelled: self.service.build(
                        workspace, source.session.id, args, cancelled
                    )
                )
                data = {
                    "id": value.id,
                    "status": value.status,
                    "output_id": value.output_id,
                    "metrics": value.metrics,
                    "files": [
                        {
                            "path": f"/workspace/results/{value.result_directory}/{item.filename}",
                            "label": item.label,
                        }
                        for item in value.artifacts
                    ],
                    "error": value.error,
                }
                summary = label("assessment_created", status=value.status)
            return tool_result({"summary": summary, **data}, max_bytes=256 * 1024)
        except AnalysisError as error:
            raise ToolExecutionError(str(error), code=error.code) from None
