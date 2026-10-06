"""Serialize native Messages history without fabricating tool input or signatures."""

import json
from collections.abc import Mapping

from kunyu.agent.runtime.content import ReasoningBlock, TextBlock, ToolCallBlock
from kunyu.agent.runtime.input_content import FileInputBlock, ImageInputBlock
from kunyu.agent.runtime.models import (
    ModelAdapterError,
    ModelErrorCode,
    ModelMessage,
    ModelRequest,
    ModelRole,
)
from kunyu.integrations.model.attachment_projection import input_blocks
from kunyu.integrations.model.connection import ModelConnectionConfig, validate_request
from kunyu.integrations.model.request_images import RequestImage, require_images_fit


def invalid(detail: str) -> ModelAdapterError:
    return ModelAdapterError(
        ModelErrorCode.INVALID_REQUEST, f"Messages request: {detail}"
    )


def _replay(message: ModelMessage, model: str) -> tuple[Mapping, ...] | None:
    envelope = message.replay_state
    if envelope is None:
        return None
    response = envelope.response
    if not isinstance(response, Mapping) or response.get("kind") != "deepseek-messages":
        return None
    if (
        type(response.get("version")) is not int
        or response["version"] != 1
        or not isinstance(response.get("model"), str)
        or not response["model"]
        or response["model"] != message.source_model
    ):
        raise invalid("Replay identity does not match its assistant source.")
    blocks = envelope.blocks
    if blocks is None or len(blocks) != len(message.content):
        raise invalid("Replay block count does not match assistant content.")
    for block, content in zip(blocks, message.content, strict=True):
        if not isinstance(block, Mapping) or block.get("type") != content.type:
            raise invalid("Replay block type does not match assistant content.")
        if "signature" in block and (
            not isinstance(content, ReasoningBlock)
            or not isinstance(block["signature"], str)
        ):
            raise invalid("Replay signature requires a reasoning block.")
    return blocks if response["model"] == model else None


def _assistant(message: ModelMessage, model: str) -> list[dict]:
    replay = _replay(message, model)
    result = []
    for index, block in enumerate(message.content):
        if isinstance(block, TextBlock):
            result.append({"type": "text", "text": block.text})
        elif isinstance(block, ReasoningBlock):
            value = {"type": "thinking", "thinking": block.text}
            if replay is not None and "signature" in replay[index]:
                value["signature"] = replay[index]["signature"]
            result.append(value)
        elif isinstance(block, ToolCallBlock):
            try:
                arguments = json.loads(block.arguments)
            except ValueError as error:
                raise invalid(
                    "Historical tool arguments must be valid JSON."
                ) from error
            if not isinstance(arguments, dict):
                raise invalid("Historical tool arguments must be an object.")
            result.append(
                {
                    "type": "tool_use",
                    "id": block.id,
                    "name": block.name,
                    "input": arguments,
                }
            )
        else:
            raise invalid("Unsupported assistant content.")
    return result


def encode_request(
    request: ModelRequest[ModelConnectionConfig],
    images: Mapping[str, RequestImage] | None = None,
) -> bytes:
    validate_request(request)
    require_images_fit(
        request.messages,
        images if images is not None else {},
        request.adapter_config.image_input,
    )
    messages: list[dict] = []
    system: str | None = None
    updates: list[dict] = []

    def flush_updates() -> None:
        if updates:
            if not messages or messages[-1]["role"] != "user":
                raise invalid("System updates require a preceding user or tool result.")
            messages.extend(updates)
            updates.clear()

    for message in request.messages:
        if not isinstance(message.role, ModelRole) or not isinstance(
            message.content, tuple
        ):
            raise invalid("Invalid message content.")
        if message.role is not ModelRole.TOOL and (
            message.tool_call_id is not None or message.is_error is not None
        ):
            raise invalid("Only tool results may carry tool identity or error state.")
        if message.role is not ModelRole.ASSISTANT and (
            message.replay_state is not None or message.source_model is not None
        ):
            raise invalid("Only assistant messages may carry model replay identity.")
        if message.role is ModelRole.ASSISTANT:
            flush_updates()
            content = _assistant(message, request.model_id)
        else:
            allowed = (
                (TextBlock, ImageInputBlock, FileInputBlock)
                if message.role is ModelRole.USER
                else (TextBlock, ImageInputBlock)
                if message.role is ModelRole.TOOL
                else (TextBlock,)
            )
            if any(not isinstance(block, allowed) for block in message.content):
                raise invalid(
                    "Attachment blocks require user input or image tool results."
                )
            content = [
                encoded
                for block in message.content
                if not isinstance(block, TextBlock) or block.text
                for encoded in input_blocks(
                    block, images if images is not None else {}, native=True
                )
            ]
            if message.role is ModelRole.SYSTEM:
                text = "".join(block.text for block in message.content)
                if request.model_id == "deepseek-flash" and messages:
                    if not text:
                        raise invalid("An in-history system update must not be empty.")
                    updates.append(
                        {"role": "system", "content": [{"type": "text", "text": text}]}
                    )
                else:
                    system = text
                continue
            if message.role is ModelRole.TOOL:
                if (
                    not isinstance(message.tool_call_id, str)
                    or not message.tool_call_id
                ):
                    raise invalid("Tool results require their provider call identity.")
                result = {
                    "type": "tool_result",
                    "tool_use_id": message.tool_call_id,
                    "content": content,
                }
                if message.is_error is not None:
                    if not isinstance(message.is_error, bool):
                        raise invalid("Tool error state must be a boolean.")
                    result["is_error"] = message.is_error
                content = [result]
            elif not content:
                continue
        role = "user" if message.role is ModelRole.TOOL else message.role.value
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"].extend(content)
        else:
            messages.append({"role": role, "content": content})
    flush_updates()
    pending: set[str] = set()
    for message in messages:
        if message["role"] == "assistant":
            if pending:
                raise invalid("Tool calls require immediate results.")
            calls = [
                block for block in message["content"] if block["type"] == "tool_use"
            ]
            pending = {block["id"] for block in calls}
            if len(pending) != len(calls):
                raise invalid("Tool call identities must be unique.")
        elif message["role"] == "user":
            results = [
                block for block in message["content"] if block["type"] == "tool_result"
            ]
            for result in results:
                if result["tool_use_id"] not in pending:
                    raise invalid("Tool result has no matching call.")
                pending.remove(result["tool_use_id"])
            if pending:
                raise invalid("Tool calls require a complete immediate result batch.")
            message["content"] = results + [
                block for block in message["content"] if block["type"] != "tool_result"
            ]
    if pending:
        raise invalid("History ends with unresolved tools.")
    if not messages:
        raise invalid("History requires a conversational message.")
    effort = (
        request.reasoning_effort if request.reasoning_effort is not None else "high"
    )
    if effort not in {"off", "low", "high", "max"}:
        raise ModelAdapterError(
            ModelErrorCode.UNSUPPORTED_CAPABILITY,
            "Unsupported Messages reasoning effort.",
        )
    names = [tool.name for tool in request.tools]
    if len(set(names)) != len(names):
        raise invalid("Tool names must be unique.")
    payload = {
        "model": request.model_id,
        "messages": messages,
        "stream": True,
        "max_tokens": request.max_output_tokens,
        "thinking": {"type": "disabled" if effort == "off" else "enabled"},
    }
    if effort != "off":
        payload["output_config"] = {"effort": effort}
    if system:
        payload["system"] = system
    if request.tools:
        payload["tools"] = [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": dict(tool.parameters),
            }
            for tool in request.tools
        ]
    try:
        return json.dumps(
            payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")
        ).encode()
    except (TypeError, ValueError) as error:
        raise invalid("Request must be JSON serializable.") from error
