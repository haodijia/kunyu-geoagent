"""Project supported native Responses items into canonical Agent content."""

import json
from collections.abc import Mapping

from kunyu.agent.runtime.content import ReasoningBlock, TextBlock, ToolCallBlock
from kunyu.agent.runtime.models import ModelAdapterError, ModelErrorCode
from kunyu.integrations.model.chat_events import MAX_TOOL_ARGUMENT_BYTES


def protocol_error(message: str) -> ModelAdapterError:
    return ModelAdapterError(ModelErrorCode.PROVIDER_PROTOCOL, message)


def identifier(value: object) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > 256:
        raise protocol_error("The Responses item identity is invalid.")
    return value


def item_block(item: Mapping, *, incomplete: bool = False):
    identifier(item.get("id"))
    kind = item.get("type")
    if not isinstance(kind, str):
        raise protocol_error("The Responses item type is invalid.")
    status = item.get("status")
    if status not in (None, "completed", "incomplete") or (
        not incomplete and status == "incomplete"
    ):
        raise protocol_error("The Responses completed item status is invalid.")
    if kind == "message":
        if item.get("role") != "assistant":
            raise protocol_error("The Responses message role is invalid.")
        return TextBlock(text=parts_text(item.get("content"), message=True))
    if kind == "reasoning":
        encrypted = item.get("encrypted_content")
        if encrypted is not None and not isinstance(encrypted, str):
            raise protocol_error("The Responses encrypted reasoning is invalid.")
        if not incomplete and not encrypted:
            raise protocol_error("The Responses reasoning item has no encrypted state.")
        summary = parts_text(item.get("summary"), message=False)
        content = item.get("content")
        thinking = parts_text(content, message=False) if content is not None else ""
        return ReasoningBlock(text=summary + thinking)
    if kind == "function_call":
        arguments = item.get("arguments")
        if (
            not isinstance(arguments, str)
            or len(arguments.encode("utf-8")) > MAX_TOOL_ARGUMENT_BYTES
        ):
            raise protocol_error("The Responses function arguments are invalid.")
        if not incomplete:
            try:
                parsed = json.loads(arguments)
                if not isinstance(parsed, dict):
                    raise TypeError("Function arguments must be an object.")
                json.dumps(parsed, allow_nan=False)
            except (ValueError, TypeError) as error:
                raise protocol_error(
                    "The Responses function arguments are invalid."
                ) from error
        return ToolCallBlock(
            id=identifier(item.get("call_id")),
            name=identifier(item.get("name")),
            arguments=arguments,
        )
    raise ModelAdapterError(
        ModelErrorCode.UNSUPPORTED_CAPABILITY,
        "The Responses provider returned an unsupported output item.",
    )


def parts_text(value: object, *, message: bool) -> str:
    if not isinstance(value, (list, tuple)):
        raise protocol_error("The Responses content parts are invalid.")
    parts = []
    for part in value:
        if not isinstance(part, Mapping):
            raise protocol_error("The Responses content part is invalid.")
        kind = part.get("type")
        allowed = (
            {"output_text", "refusal"}
            if message
            else {"summary_text", "reasoning_text"}
        )
        text = part.get("refusal" if kind == "refusal" else "text")
        if (
            not isinstance(kind, str)
            or kind not in allowed
            or not isinstance(text, str)
        ):
            raise protocol_error("The Responses content part is invalid.")
        parts.append(text)
    return "".join(parts)
