"""OGE tools own their user summaries, previews and durable compact references."""

from kunyu.agent.runtime.contracts.tool_output import (
    AnalysisDisplay,
    ImagesDisplay,
    TextDisplay,
)
from kunyu.agent.runtime.contracts.tools import ToolOutputContract
from kunyu.agent.tools.outputs.shared import (
    agent_content,
    compact,
    images,
    label,
    object_result,
)


def operator_definitions_display(result):
    data = object_result(result)
    failed = sum("error" in row for row in data["operators"])
    return TextDisplay(
        summary=label(
            "operator_definitions",
            succeeded=len(data["operators"]) - failed,
            failed=failed,
        ),
        text="\n".join(
            row["name"]
            + (
                " · " + row["error"]["code"] + ": " + row["error"]["message"]
                if "error" in row
                else ""
            )
            for row in data["operators"]
        ),
    )


def operator_definitions_compact(result):
    data = object_result(result)
    return compact(
        operator_definitions_display(result).summary,
        {
            "operators": [
                row
                if "error" in row
                else {
                    key: row[key]
                    for key in ("name", "description", "args", "output")
                    if key in row
                }
                | {"sample_code_omitted": True}
                for row in data["operators"]
            ],
        },
    )


OPERATOR_DEFINITIONS = ToolOutputContract(
    agent_content, operator_definitions_display, operator_definitions_compact
)


def operators_display(result):
    data = object_result(result)
    return TextDisplay(
        summary=label("operators", total=len(data["operators"])),
        text="\n".join(
            row["name"] + " · " + row["description"] for row in data["operators"]
        ),
    )


def operators_compact(result):
    data = object_result(result)
    return compact(
        operators_display(result).summary,
        {"operators": [row["name"] for row in data["operators"]]},
    )


OPERATORS = ToolOutputContract(agent_content, operators_display, operators_compact)


def analysis_display(result):
    data = object_result(result)
    if data["job"]["status"] == "failed":
        error = data["job"]["error"]
        return TextDisplay(
            summary=label("analysis_state", status=label("job_state_failed")),
            text=label(
                "job_error",
                stage=label("job_stage_" + data["job"]["stage"]),
                code=error["code"],
                message=error["message"],
            ),
        )
    return AnalysisDisplay(
        summary=label(
            "analysis_state", status=label("job_state_" + data["job"]["status"])
        ),
        job_id=data["job"]["id"],
    )


def analysis_compact(result):
    data = object_result(result)
    facts = {"job": data["job"], "file_path": data["file_path"]}
    if isinstance(data.get("result"), dict):
        facts["result"] = data["result"]
    if "result_file_path" in data:
        facts["result_file_path"] = data["result_file_path"]
    return compact(analysis_display(result).summary, facts)


ANALYSIS = ToolOutputContract(agent_content, analysis_display, analysis_compact)


def image_preview_display(result):
    return ImagesDisplay(
        summary=label("preview"),
        images=images(result),
        description=label("image_preview"),
    )


def image_preview_compact(result):
    return compact(
        label("preview"),
        {
            **object_result(result),
            "images": [ref.model_dump(mode="json") for ref in images(result)],
            "pixels_omitted": True,
        },
    )


IMAGE_PREVIEW = ToolOutputContract(
    agent_content, image_preview_display, image_preview_compact
)


def regions_display(result):
    if not isinstance(result.result, list):
        raise TypeError("Region search requires a list result.")
    names = "、".join(row["name"] for row in result.result)
    return TextDisplay(summary=label("regions"), text=names)


def regions_compact(result):
    return compact(label("regions"), result.result)


REGIONS = ToolOutputContract(agent_content, regions_display, regions_compact)


def imagery_display(result):
    data = object_result(result)
    return TextDisplay(
        summary=label("imagery", total=len(data["images"])),
        text=label("imagery", total=len(data["images"])),
    )


def imagery_compact(result):
    data = object_result(result)
    return compact(
        imagery_display(result).summary,
        {key: data[key] for key in ("page", "next_page")}
        | {"image_ids": [row["imageId"] for row in data["images"]]},
    )


IMAGERY = ToolOutputContract(agent_content, imagery_display, imagery_compact)


def image_detail_display(result):
    data = object_result(result)
    return TextDisplay(
        summary=label("image_detail"),
        text=str(data["productName"]) + " · " + str(data["phenomenonTime"]),
    )


def image_detail_compact(result):
    data = object_result(result)
    return compact(
        label("image_detail"),
        {
            key: value
            for key, value in data.items()
            if key not in {"description", "footprint"}
        },
    )


IMAGE_DETAIL = ToolOutputContract(
    agent_content, image_detail_display, image_detail_compact
)


def assets_display(result):
    data = object_result(result)
    return TextDisplay(
        summary=label("assets", total=len(data["assets"])),
        text=label("assets", total=len(data["assets"])),
    )


def assets_compact(result):
    data = object_result(result)
    return compact(
        assets_display(result).summary,
        {
            "page": data["page"],
            "next_page": data["next_page"],
            "assets": [
                {"assetUuid": row["assetUuid"], "reference": row["reference"]}
                for row in data["assets"]
            ],
        },
    )


ASSETS = ToolOutputContract(agent_content, assets_display, assets_compact)


def asset_display(result):
    return TextDisplay(summary=label("asset_detail"), text=label("asset_detail"))


def asset_compact(result):
    return compact(label("asset_detail"), object_result(result))


ASSET = ToolOutputContract(agent_content, asset_display, asset_compact)
