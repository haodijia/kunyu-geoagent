"""Encode Chat Completions for explicitly configured compatible connections."""

import json
from collections.abc import Mapping

from kunyu.agent.runtime.content import (
    ReasoningBlock,
    TextBlock,
    ToolCallBlock,
    content_text,
)
from kunyu.agent.runtime.input_content import FileInputBlock, ImageInputBlock
from kunyu.agent.runtime.models import (
    ModelMessage,
    ModelRequest,
    ModelRole,
)
from kunyu.agent.runtime.tools import ToolSpec
from kunyu.domain.model_connections import ModelProviderType
from kunyu.integrations.model.attachment_projection import input_blocks
from kunyu.integrations.model.connection import (
    ModelConnectionConfig,
    invalid_request,
    validate_request,
)
from kunyu.integrations.model.request_images import RequestImage, require_images_fit


def encode_request(
    request: ModelRequest[ModelConnectionConfig],
    images: Mapping[str, RequestImage] | None = None,
) -> bytes:
    config = request.adapter_config
    validate_request(request, maximum_output_tokens=4_096)
    require_images_fit(
        request.messages, images if images is not None else {}, config.image_input
    )
    messages = [
        _serialize_message(message, images if images is not None else {})
        for message in request.messages
    ]
    if config.provider_type in {
        ModelProviderType.DEEPSEEK,
        ModelProviderType.MOONSHOT,
        ModelProviderType.MIMO,
        ModelProviderType.ZAI,
    }:
        for message, serialized in zip(request.messages, messages, strict=True):
            if message.role is ModelRole.ASSISTANT:
                if any(isinstance(block, ReasoningBlock) for block in message.content):
                    serialized["reasoning_content"] = content_text(
                        message.content, reasoning=True
                    )
                elif (
                    config.provider_type is ModelProviderType.DEEPSEEK
                    and request.tools
                    and any(
                        isinstance(block, ToolCallBlock) for block in message.content
                    )
                    and request.reasoning_effort != "off"
                ):
                    raise invalid_request(
                        "DeepSeek thinking tool history is missing its reasoning content."
                    )
    messages = _project_tool_images(
        request.messages, messages, images if images is not None else {}
    )
    tools = [serialize_tool(tool) for tool in request.tools]
    _require_unique_tool_names(tools)
    payload: dict[str, object] = {
        "model": request.model_id,
        "messages": messages,
        "stream": True,
        config.max_tokens_field.value: request.max_output_tokens,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    if config.include_usage:
        payload["stream_options"] = {"include_usage": True}
    if (
        config.provider_type is ModelProviderType.DEEPSEEK
        and request.reasoning_effort is not None
    ):
        effort = request.reasoning_effort
        if effort not in {"off", "low", "high", "max"}:
            raise invalid_request(
                "DeepSeek reasoning effort must be off, low, high or max."
            )
        payload["thinking"] = {"type": "disabled" if effort == "off" else "enabled"}
        if effort != "off":
            payload["reasoning_effort"] = effort
    elif request.reasoning_effort is not None:
        payload["reasoning_effort"] = request.reasoning_effort
    try:
        return json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise invalid_request("The model request is not JSON serializable.") from error


def _serialize_message(
    message: ModelMessage, images: Mapping[str, RequestImage]
) -> dict[str, object]:
    if (
        not isinstance(message.role, ModelRole)
        or not isinstance(message.content, tuple)
        or any(
            not isinstance(
                block,
                (
                    TextBlock,
                    ReasoningBlock,
                    ToolCallBlock,
                    ImageInputBlock,
                    FileInputBlock,
                ),
            )
            for block in message.content
        )
    ):
        raise invalid_request("The model message content blocks are invalid.")
    attachments = any(
        isinstance(block, (ImageInputBlock, FileInputBlock))
        for block in message.content
    )
    if attachments and message.role not in {ModelRole.USER, ModelRole.TOOL}:
        raise invalid_request(
            "Only user input and tool results may contain attachments."
        )
    if message.role is ModelRole.TOOL and any(
        isinstance(block, FileInputBlock) for block in message.content
    ):
        raise invalid_request("Tool results may contain only text and image blocks.")
    calls = tuple(
        block for block in message.content if isinstance(block, ToolCallBlock)
    )
    if message.role is not ModelRole.ASSISTANT and (
        calls
        or message.replay_state is not None
        or any(isinstance(block, ReasoningBlock) for block in message.content)
    ):
        raise invalid_request(
            "Only assistant messages may contain model blocks or replay state."
        )
    payload: dict[str, object] = {
        "role": message.role.value,
        "content": "\n".join(
            encoded["text"]
            for block in message.content
            for encoded in input_blocks(block, images, native=False)
            if encoded["type"] == "text"
        )
        if message.role is ModelRole.TOOL
        else [
            encoded
            for block in message.content
            for encoded in input_blocks(block, images, native=False)
        ]
        if attachments
        else content_text(message.content),
    }
    if message.role is ModelRole.TOOL:
        if (
            not isinstance(message.tool_call_id, str)
            or not message.tool_call_id.strip()
            or len(message.tool_call_id) > 256
        ):
            raise invalid_request("The tool result message is invalid.")
        payload["tool_call_id"] = message.tool_call_id
    elif message.tool_call_id is not None:
        raise invalid_request("Only tool results may name tool_call_id.")
    if calls:
        if len({call.id for call in calls}) != len(calls):
            raise invalid_request("Assistant tool-call IDs must be unique.")
        payload["tool_calls"] = [
            {
                "id": call.id,
                "type": "function",
                "function": {"name": call.name, "arguments": call.arguments},
            }
            for call in calls
        ]
    return payload


def _project_tool_images(
    history: tuple[ModelMessage, ...],
    serialized: list[dict[str, object]],
    images: Mapping[str, RequestImage],
) -> list[dict[str, object]]:
    """Chat tool messages carry text; lift pixels after their complete result batch."""
    result = []
    pending = []

    def flush() -> None:
        if pending:
            result.append(
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Attached image(s) from tool result:"},
                        *pending,
                    ],
                }
            )
            pending.clear()

    for message, encoded in zip(history, serialized, strict=True):
        if message.role is not ModelRole.TOOL:
            flush()
        result.append(encoded)
        if message.role is ModelRole.TOOL:
            for block in message.content:
                if isinstance(block, ImageInputBlock) and block.offloaded is not True:
                    pending.extend(
                        item
                        for item in input_blocks(block, images, native=False)
                        if item["type"] == "image_url"
                    )
    flush()
    return result


def serialize_tool(tool: ToolSpec) -> dict[str, object]:
    if (
        not isinstance(tool.name, str)
        or not tool.name
        or len(tool.name) > 256
        or not isinstance(tool.description, str)
        or not isinstance(tool.parameters, Mapping)
    ):
        raise invalid_request("The model tool definition is invalid.")
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": dict(tool.parameters),
        },
    }


def _require_unique_tool_names(tools: list[dict[str, object]]) -> None:
    names: set[str] = set()
    for tool in tools:
        function = tool["function"]
        if not isinstance(function, dict) or not isinstance(function.get("name"), str):
            raise invalid_request("The model tool definition is invalid.")
        name = function["name"]
        if name in names:
            raise invalid_request("Model tool names must be unique.")
        names.add(name)
