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


def operator_display(result):
    data = object_result(result)
    return TextDisplay(
        summary=label("operator", name=data["name"]), text=data["description"]
    )


def operator_compact(result):
    data = object_result(result)
    return compact(
        operator_display(result).summary,
        {
            "name": data["name"],
            "description": data["description"],
            "args": data["args"],
            "output": data["output"],
            "sample_code_omitted": True,
        },
    )


OPERATOR = ToolOutputContract(agent_content, operator_display, operator_compact)


def operators_display(result):
    data = object_result(result)
    return TextDisplay(
        summary=label("operators", total=data["total"]),
        text="\n".join(
            row["name"] + " · " + row["description"] for row in data["operators"]
        ),
    )


def operators_compact(result):
    data = object_result(result)
    return compact(
        operators_display(result).summary,
        {
            "total": data["total"],
            "offset": data["offset"],
            "operators": [row["name"] for row in data["operators"]],
        },
    )


OPERATORS = ToolOutputContract(agent_content, operators_display, operators_compact)


def analysis_display(result):
    data = object_result(result)
    return AnalysisDisplay(
        summary=label(
            "analysis_state", status=label("job_state_" + data["job"]["status"])
        ),
        job_id=data["analysis_job_id"],
    )


def analysis_compact(result):
    data = object_result(result)
    facts = {"analysis_job_id": data["analysis_job_id"], "job": data["job"]}
    if isinstance(data.get("result"), dict):
        facts["result"] = data["result"]
    return compact(analysis_display(result).summary, facts)


ANALYSIS = ToolOutputContract(agent_content, analysis_display, analysis_compact)


def preview_contract(description_key):
    def frontend(result):
        return ImagesDisplay(
            summary=label("preview"),
            images=images(result),
            description=label(description_key),
        )

    def shortened(result):
        return compact(
            label("preview"),
            {
                **object_result(result),
                "images": [ref.model_dump(mode="json") for ref in images(result)],
                "pixels_omitted": True,
            },
        )

    return ToolOutputContract(agent_content, frontend, shortened)


PREVIEW = preview_contract("result_preview")
IMAGE_PREVIEW = preview_contract("image_preview")


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
        summary=label("imagery", total=data["total"]),
        text=label("imagery", total=data["total"]),
    )


def imagery_compact(result):
    data = object_result(result)
    return compact(
        imagery_display(result).summary,
        {key: data[key] for key in ("candidate_set_id", "total", "page", "next_page")}
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
        summary=label("assets", total=data["total"]),
        text=label("assets", total=data["total"]),
    )


def assets_compact(result):
    data = object_result(result)
    return compact(
        assets_display(result).summary,
        {
            "total": data["total"],
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


def download_display(result):
    return TextDisplay(summary=label("download"), text=label("download"))


def download_compact(result):
    return compact(label("download"), object_result(result))


DOWNLOAD = ToolOutputContract(agent_content, download_display, download_compact)
