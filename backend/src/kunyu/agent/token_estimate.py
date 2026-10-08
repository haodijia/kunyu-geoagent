"""Harness fixed-density estimates; these are not provider token counts."""

# Adapted from deepseek-harness (MIT); see tools/DeepSeek-LICENSE.txt.

import json
import math

from kunyu.agent.runtime.content import ReasoningBlock, TextBlock, ToolCallBlock
from kunyu.agent.runtime.models import ModelMessage, ModelRole


def text_tokens(value: str) -> int:
    return math.ceil((len(value.encode("utf-16-le")) // 2) / 4)


def estimate_message(message: ModelMessage) -> int:
    if message.role is ModelRole.SYSTEM:
        return (
            text_tokens(
                "".join(
                    block.text
                    if isinstance(block, TextBlock)
                    else json.dumps(
                        block.model_dump(mode="json"),
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    for block in message.content
                )
            )
            + 4
            if message.content
            else 0
        )
    result = 4
    for block in message.content:
        if isinstance(block, (TextBlock, ReasoningBlock)):
            result += text_tokens(block.text) + 4
        elif isinstance(block, ToolCallBlock):
            result += text_tokens(block.name) + text_tokens(block.arguments) + 4
        else:
            data = block.model_dump(mode="json")
            data.pop("offloaded", None)
            result += (
                text_tokens(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
                + 4
            )
    return result


def estimate_messages(messages: tuple[ModelMessage, ...]) -> int:
    return sum(estimate_message(message) for message in messages)
