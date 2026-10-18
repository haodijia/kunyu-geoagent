"""External tools use an explicit text/image policy, never the raw wire envelope."""

from kunyu.agent.runtime.contracts.tool_output import ImagesDisplay, TextDisplay
from kunyu.agent.runtime.contracts.tools import ToolOutputContract
from kunyu.agent.tools.outputs.shared import agent_content, compact, images, label, text


def frontend(result):
    refs = images(result)
    if refs:
        return ImagesDisplay(
            summary=label("mcp"), images=refs, description=text(result)
        )
    return TextDisplay(summary=label("mcp"), text=text(result))


def shortened(result):
    content = text(result)
    # External schemas do not declare which text fields are safe to omit.
    return compact(
        label("mcp"),
        {
            "text": content,
            "images": [ref.model_dump(mode="json") for ref in images(result)],
            "pixels_omitted": True,
        },
    )


MCP = ToolOutputContract(agent_content, frontend, shortened)
