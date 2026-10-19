"""Map projections describe receipts rather than claiming a render succeeded."""

from kunyu.agent.runtime.contracts.tool_output import MapDisplay, TextDisplay
from kunyu.agent.runtime.contracts.tools import ToolOutputContract
from kunyu.agent.tools.outputs.shared import (
    agent_content,
    compact,
    label,
    object_result,
)
from kunyu.domain.geospatial.analysis import MapPresentation


def present_display(result):
    receipt = MapPresentation.model_validate(object_result(result)["presentation"])
    return MapDisplay(summary=label("map_" + receipt.status), presentation=receipt)


def present_compact(result):
    return compact(present_display(result).summary, object_result(result))


PRESENT = ToolOutputContract(agent_content, present_display, present_compact)


def context_display(result):
    data = object_result(result)
    return TextDisplay(
        summary=label("map_context"),
        text=label("map_layers", count=len(data["layers"])),
    )


def context_compact(result):
    data = object_result(result)
    return compact(
        label("map_context"),
        {
            "state": data["state"],
            "layers": data["layers"],
        },
    )


CONTEXT = ToolOutputContract(agent_content, context_display, context_compact)


def style_display(result):
    return TextDisplay(summary=label("map_style"), text=label("map_style"))


def style_compact(result):
    return compact(label("map_style"), object_result(result))


STYLE = ToolOutputContract(agent_content, style_display, style_compact)
