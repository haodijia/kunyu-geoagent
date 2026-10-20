"""Report committed layer changes without claiming that a client rendered them."""

from kunyu.agent.runtime.contracts.tool_output import ImagesDisplay, TextDisplay
from kunyu.agent.runtime.contracts.tools import ToolOutputContract
from kunyu.agent.tools.outputs.shared import (
    agent_content,
    compact,
    images,
    label,
    object_result,
)


def present_display(result):
    summary = label("map_added", count=len(object_result(result)["layers"]))
    return TextDisplay(summary=summary, text=summary)


def present_compact(result):
    return compact(present_display(result).summary, object_result(result))


PRESENT = ToolOutputContract(agent_content, present_display, present_compact)


def context_display(result):
    data = object_result(result)
    if refs := images(result):
        return ImagesDisplay(
            summary=label("map_context"),
            description=label("map_layers", count=len(data["layers"])),
            images=refs,
        )
    return TextDisplay(
        summary=label("map_context"),
        text=label("map_layers", count=len(data["layers"])),
    )


def context_compact(result):
    data = object_result(result)
    if refs := images(result):
        data = data | {
            "images": [ref.model_dump(mode="json") for ref in refs],
            "pixels_omitted": True,
        }
    return compact(label("map_context"), data)


CONTEXT = ToolOutputContract(agent_content, context_display, context_compact)


def style_display(result):
    return TextDisplay(summary=label("map_style"), text=label("map_style"))


def style_compact(result):
    return compact(label("map_style"), object_result(result))


STYLE = ToolOutputContract(agent_content, style_display, style_compact)
