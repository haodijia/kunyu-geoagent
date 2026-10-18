"""Small projection primitives; no tool-name dispatch or implicit JSON UI."""

import json

from kunyu.agent.prompts.loader import prompt_text
from kunyu.agent.runtime.contracts.content import TextBlock
from kunyu.agent.runtime.contracts.input_content import ImageInputBlock
from kunyu.agent.runtime.contracts.tool_output import ToolCompaction
from kunyu.agent.runtime.contracts.tools import ToolResult


def label(key: str, **values: object) -> str:
    return prompt_text(
        "tool-views.yaml", key, **{key: str(value) for key, value in values.items()}
    )


def agent_content(result: ToolResult):
    return result.content


def text(result: ToolResult) -> str:
    return "\n".join(
        block.text for block in result.content if isinstance(block, TextBlock)
    )


def images(result: ToolResult):
    return tuple(
        block.attachment
        for block in result.content
        if isinstance(block, ImageInputBlock)
    )


def object_result(result: ToolResult) -> dict:
    if not isinstance(result.result, dict):
        raise ValueError("This tool requires an object result.")
    return result.result


def compact(summary: str, facts: object) -> ToolCompaction:
    return ToolCompaction(
        summary=summary[:240],
        content=(
            TextBlock(
                text=json.dumps(facts, ensure_ascii=False, separators=(",", ":"))
            ),
        ),
    )
