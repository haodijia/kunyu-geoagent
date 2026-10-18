"""File tools retain locators and continuation boundaries when compacted."""

from kunyu.agent.runtime.contracts.tool_output import DataDisplay
from kunyu.agent.runtime.contracts.tools import ToolOutputContract
from kunyu.agent.tools.outputs.shared import (
    agent_content,
    compact,
    images,
    label,
    object_result,
    text,
)


def read_display(result):
    data = object_result(result)
    return DataDisplay(
        kind="read",
        summary=label("read", path=data["path"], count=len(data["lines"]))[:240],
        data=data,
        text=text(result),
    )


def read_compact(result):
    data = object_result(result)
    return compact(
        read_display(result).summary,
        {
            key: data[key]
            for key in ("path", "offset", "total_lines", "truncated_by_bytes")
        }
        | {
            "returned_lines": len(data["lines"]),
            "last_line": data["lines"][-1]["number"]
            if data["lines"]
            else data["offset"] - 1,
        },
    )


READ = ToolOutputContract(agent_content, read_display, read_compact)


def search_display(result):
    data = object_result(result)
    return DataDisplay(
        kind="search",
        summary=label("search", total=data["total"]),
        data=data,
        text=text(result),
    )


def search_compact(result):
    data = object_result(result)
    return compact(
        search_display(result).summary,
        {key: data[key] for key in ("shape", "total", "truncated", "artifact_path")},
    )


SEARCH = ToolOutputContract(agent_content, search_display, search_compact)


def mutation_display(result):
    data = object_result(result)
    return DataDisplay(
        kind="file_change",
        summary=label("file_change", path=data["path"])[:240],
        data=data,
        text=text(result),
    )


def mutation_compact(result):
    data = object_result(result)
    return compact(
        mutation_display(result).summary,
        {"path": data["path"], "operation": data["operation"]},
    )


MUTATION = ToolOutputContract(agent_content, mutation_display, mutation_compact)


def image_display(result):
    data = object_result(result)
    return DataDisplay(
        kind="image_read",
        summary=label("image_read", path=data["path"])[:240],
        data=data,
        text=text(result),
        images=images(result),
    )


def image_compact(result):
    return compact(
        image_display(result).summary,
        {
            "path": object_result(result)["path"],
            "images": [ref.model_dump(mode="json") for ref in images(result)],
            "pixels_omitted": True,
        },
    )


IMAGE = ToolOutputContract(agent_content, image_display, image_compact)
