"""Encode stateless Responses history, including completed encrypted reasoning."""

import json
from collections.abc import Mapping

from kunyu.agent.runtime.content import ReasoningBlock, TextBlock, ToolCallBlock
from kunyu.agent.runtime.input_content import FileInputBlock, ImageInputBlock
from kunyu.agent.runtime.models import (
    ModelAdapterError,
    ModelMessage,
    ModelRequest,
    ModelRole,
)
from kunyu.integrations.model.attachment_projection import input_blocks
from kunyu.integrations.model.connection import (
    ModelConnectionConfig,
    invalid_request,
    validate_request,
)
from kunyu.integrations.model.openai_chat_request import serialize_tool
from kunyu.integrations.model.openai_responses_items import item_block
from kunyu.integrations.model.request_images import RequestImage, require_images_fit


def encode_request(
    request: ModelRequest[ModelConnectionConfig],
    images: Mapping[str, RequestImage] | None = None,
) -> bytes:
    validate_request(request)
    images = images if images is not None else {}
    config = request.adapter_config
    require_images_fit(request.messages, images, config.image_input)
    items = []
    pending: set[str] = set()
    seen: set[str] = set()
    for message in request.messages:
        if not isinstance(message.role, ModelRole) or not isinstance(
            message.content, tuple
        ):
            raise invalid_request("The Responses message is invalid.")
        if message.role is not ModelRole.TOOL and (
            message.tool_call_id is not None or message.is_error is not None
        ):
            raise invalid_request(
                "Only tool results may carry tool identity or error state."
            )
        if message.role is not ModelRole.ASSISTANT and (
            message.replay_state is not None or message.source_model is not None
        ):
            raise invalid_request("Only assistant messages may carry replay identity.")
        if message.role is ModelRole.TOOL:
            if (
                not isinstance(message.tool_call_id, str)
                or not message.tool_call_id.strip()
                or len(message.tool_call_id) > 256
                or message.tool_call_id not in pending
                or (message.is_error is not None and type(message.is_error) is not bool)
            ):
                raise invalid_request("The Responses tool result has no pending call.")
            pending.remove(message.tool_call_id)
            allowed = (TextBlock, ImageInputBlock)
            if any(not isinstance(block, allowed) for block in message.content):
                raise invalid_request("The Responses tool result content is invalid.")
            items.append(
                {
                    "type": "function_call_output",
                    "call_id": message.tool_call_id,
                    "output": _input(message, images),
                }
            )
            continue
        if pending:
            raise invalid_request(
                "The Responses history has an incomplete tool-result batch."
            )
        if message.role is ModelRole.ASSISTANT:
            items.extend(_assistant(message, request))
            for block in message.content:
                if isinstance(block, ToolCallBlock):
                    if block.id in seen:
                        raise invalid_request(
                            "The Responses history has duplicate call IDs."
                        )
                    seen.add(block.id)
                    pending.add(block.id)
        else:
            allowed = (
                (TextBlock, ImageInputBlock, FileInputBlock)
                if message.role is ModelRole.USER
                else (TextBlock,)
            )
            if any(not isinstance(block, allowed) for block in message.content):
                raise invalid_request("The Responses input content is invalid.")
            items.append(
                {"role": message.role.value, "content": _input(message, images)}
            )
    if pending:
        raise invalid_request("The Responses history has unresolved tool calls.")
    tools = []
    names: set[str] = set()
    for tool in request.tools:
        function = serialize_tool(tool)["function"]
        if function["name"] in names:
            raise invalid_request("Model tool names must be unique.")
        names.add(function["name"])
        # Preserve optional tool parameters; the local tool registry validates input.
        tools.append({"type": "function", **function, "strict": False})
    payload = {
        "model": request.model_id,
        "input": items,
        "stream": True,
        "store": False,
        "include": ["reasoning.encrypted_content"],
        "max_output_tokens": request.max_output_tokens,
    }
    if tools:
        payload.update(tools=tools, tool_choice="auto")
    payload.update(config.reasoning_parameters.payload())
    try:
        return json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
    except (ValueError, TypeError) as error:
        raise invalid_request(
            "The Responses request is not JSON serializable."
        ) from error


def _input(message: ModelMessage, images: Mapping[str, RequestImage]) -> list[dict]:
    result = []
    for block in message.content:
        for encoded in input_blocks(block, images, native=False):
            if encoded["type"] == "text":
                result.append({"type": "input_text", "text": encoded["text"]})
            else:
                result.append(
                    {
                        "type": "input_image",
                        "image_url": encoded["image_url"]["url"],
                        "detail": "auto",
                    }
                )
    return result


def _assistant(
    message: ModelMessage, request: ModelRequest[ModelConnectionConfig]
) -> list[dict]:
    if any(
        not isinstance(block, (TextBlock, ReasoningBlock, ToolCallBlock))
        for block in message.content
    ):
        raise invalid_request("The Responses assistant content is invalid.")
    envelope = message.replay_state
    native = None
    if (
        envelope is not None
        and isinstance(envelope.response, Mapping)
        and envelope.response.get("kind") == "openai-responses"
    ):
        response = envelope.response
        if (
            type(response.get("version")) is not int
            or response["version"] != 1
            or response.get("model") != message.source_model
            or not isinstance(response.get("model"), str)
            or not isinstance(response.get("connection_id"), str)
            or not response["connection_id"]
            or not isinstance(response.get("base_url"), str)
            or not response["base_url"]
            or type(response.get("config_revision")) is not int
            or response["config_revision"] < 1
            or response.get("status") not in ("completed", "incomplete")
        ):
            raise invalid_request(
                "Responses replay identity does not match its assistant source."
            )
        if envelope.blocks is None or len(envelope.blocks) != len(message.content):
            raise invalid_request(
                "Responses replay block count does not match assistant content."
            )
        for replay, block in zip(envelope.blocks, message.content, strict=True):
            if (
                not isinstance(replay, Mapping)
                or replay.get("type") != block.type
                or not isinstance(replay.get("item"), Mapping)
            ):
                raise invalid_request(
                    "Responses replay block does not match assistant content."
                )
            try:
                projected = item_block(
                    replay["item"], incomplete=response["status"] == "incomplete"
                )
            except ModelAdapterError as error:
                raise invalid_request("Responses replay item is invalid.") from error
            if projected != block:
                raise invalid_request(
                    "Responses replay content does not match its native item."
                )
        config = request.adapter_config
        if (
            response.get("model") == request.model_id
            and response.get("connection_id") == config.connection_id
            and response.get("base_url") == config.base_url
            and response.get("config_revision") == config.config_revision
        ):
            native = envelope.model_dump(mode="json")["blocks"]
    result = []
    for index, block in enumerate(message.content):
        if native is not None:
            item = native[index]["item"]
            if isinstance(block, ReasoningBlock) and not item.get("encrypted_content"):
                if envelope.response["status"] == "incomplete":
                    # Truncated private state is not a valid native input item.
                    continue
                raise invalid_request(
                    "Responses reasoning history is missing encrypted state."
                )
            result.append(item)
        elif isinstance(block, TextBlock):
            result.append(
                {
                    "role": "assistant",
                    "content": [
                        {"type": "output_text", "text": block.text, "annotations": []}
                    ],
                }
            )
        elif isinstance(block, ToolCallBlock):
            try:
                arguments = json.loads(block.arguments)
                if not isinstance(arguments, dict):
                    raise TypeError("Function arguments must be an object.")
                json.dumps(arguments, allow_nan=False)
            except (ValueError, TypeError) as error:
                raise invalid_request(
                    "Historical function arguments must be a JSON object."
                ) from error
            result.append(
                {
                    "type": "function_call",
                    "call_id": block.id,
                    "name": block.name,
                    "arguments": block.arguments,
                }
            )
        # Foreign reasoning has no native encrypted state to send to this caller.
    return result
