"""One canonical-content bridge to the SDK's provider-neutral message model."""

import json
from collections.abc import Mapping
from dataclasses import replace

from pydantic_ai import messages as sdk

from kunyu.agent.prompt_files import prompt_text
from kunyu.agent.runtime.content import (
    ReasoningBlock,
    ReplayEnvelope,
    TextBlock,
    ToolCallBlock,
)
from kunyu.agent.runtime.image_offload import offloaded_image_text
from kunyu.agent.runtime.input_content import FileInputBlock, ImageInputBlock
from kunyu.agent.runtime.models import ModelRole
from kunyu.domain.attachments import attachment_path
from kunyu.integrations.model.connection import invalid_request

SDK_REPLAY_KIND = "pydantic-model"


def canonical_part(part, *, pending: bool = False):
    if isinstance(part, sdk.TextPart):
        return TextBlock(text=part.content)
    if isinstance(part, sdk.ThinkingPart):
        return ReasoningBlock(text=part.content)
    if isinstance(part, sdk.ToolCallPart):
        arguments = (
            part.args
            if isinstance(part.args, str)
            else json.dumps(part.args, ensure_ascii=False, allow_nan=False)
        )
        if part.args is None and not pending:
            raise invalid_request("The SDK tool call has no argument value.")
        if part.args is None:
            arguments = ""
        return ToolCallBlock(
            id=part.tool_call_id, name=part.tool_name, arguments=arguments
        )
    raise invalid_request("The SDK returned an unsupported response part.")


def origin(config, model_id: str) -> dict:
    return {
        "connection_id": config.connection_id,
        "revision": config.config_revision,
        "protocol": config.protocol.value,
        "base_url": config.base_url,
        "model": model_id,
    }


def replay_envelope(
    response: sdk.ModelResponse, config, model_id: str
) -> ReplayEnvelope:
    data = sdk.ModelMessagesTypeAdapter.dump_python([response], mode="json")[0]
    # SDK-normalized usage is not a provider receipt; the journal owns reported usage.
    data.pop("usage")
    parts = data.pop("parts")
    return ReplayEnvelope(
        response={
            "kind": SDK_REPLAY_KIND,
            "version": 1,
            "origin": origin(config, model_id),
            "response": data,
        },
        blocks=tuple(
            {"type": canonical_part(part).type, "part": value}
            for part, value in zip(response.parts, parts, strict=True)
        ),
    )


def _response(message, config, model_id: str) -> sdk.ModelResponse:
    if message.replay_state is None:
        parts = []
        for block in message.content:
            if isinstance(block, TextBlock):
                parts.append(sdk.TextPart(block.text))
            elif isinstance(block, ReasoningBlock):
                parts.append(sdk.ThinkingPart(block.text))
            elif isinstance(block, ToolCallBlock):
                parts.append(sdk.ToolCallPart(block.name, block.arguments, block.id))
            else:
                raise invalid_request(
                    "Assistant history contains unsupported input parts."
                )
        return sdk.ModelResponse(parts, model_name=message.source_model)
    envelope = message.replay_state.model_dump(mode="json")
    header, entries = envelope["response"], envelope["blocks"]
    if (
        not isinstance(header, dict)
        or header.get("kind") != SDK_REPLAY_KIND
        or header.get("version") != 1
    ):
        raise invalid_request(
            "This development history uses a retired replay format; start a new session."
        )
    source = header["origin"]
    if (
        source["model"] != message.source_model
        or entries is None
        or len(entries) != len(message.content)
    ):
        raise invalid_request("SDK replay provenance does not match assistant history.")
    response = sdk.ModelMessagesTypeAdapter.validate_python(
        [{**header["response"], "parts": [entry["part"] for entry in entries]}]
    )[0]
    if (
        not isinstance(response, sdk.ModelResponse)
        or tuple(canonical_part(part) for part in response.parts) != message.content
    ):
        raise invalid_request("SDK replay content does not match its canonical blocks.")
    if source != origin(config, model_id):
        parts = [
            replace(
                part, signature=None, id=None, provider_name=None, provider_details=None
            )
            if isinstance(part, sdk.ThinkingPart)
            else replace(part, id=None, provider_name=None, provider_details=None)
            if isinstance(part, sdk.ToolCallPart)
            else part
            for part in response.parts
        ]
        response = replace(
            response, parts=parts, provider_response_id=None, provider_details=None
        )
    return response


def _input(block, images: Mapping):
    if isinstance(block, TextBlock):
        return [block.text]
    if isinstance(block, FileInputBlock):
        return [
            prompt_text(
                "context.yaml",
                "attached_file",
                attachment=json.dumps(
                    {
                        "file_path": attachment_path(block.attachment),
                        "name": block.attachment.name,
                        "bytes": block.attachment.bytes,
                    },
                    ensure_ascii=False,
                ),
            )
        ]
    if isinstance(block, ImageInputBlock):
        if block.offloaded is True:
            return [offloaded_image_text(block.attachment)]
        if (
            block.attachment.id not in images
            or images[block.attachment.id].attachment != block.attachment
        ):
            raise invalid_request(
                "SDK image input does not match its attachment receipt."
            )
        image = images[block.attachment.id]
        return [
            prompt_text(
                "context.yaml",
                "attached_image",
                attachment=json.dumps(
                    {
                        "file_path": attachment_path(image.attachment),
                        "name": image.attachment.name,
                        "width": image.width,
                        "height": image.height,
                        "bytes": len(image.data),
                    },
                    ensure_ascii=False,
                ),
            ),
            sdk.BinaryContent(
                data=image.data,
                media_type=image.attachment.media_type,
                identifier=image.attachment.id,
            ),
        ]
    raise invalid_request("Unsupported SDK input content.")


def sdk_messages(request, images: Mapping) -> list:
    result, pending, results, pixels = [], {}, [], []
    have_input = False
    for message in request.messages:
        if message.role is ModelRole.TOOL:
            identity = message.tool_call_id
            if identity not in pending:
                raise invalid_request("A tool result has no preceding SDK tool call.")
            name = pending.pop(identity)
            content = [
                part for block in message.content for part in _input(block, images)
            ]
            texts = [part for part in content if isinstance(part, str)]
            pixels.extend(
                part for part in content if isinstance(part, sdk.BinaryContent)
            )
            results.append(
                sdk.ToolReturnPart(
                    name,
                    "\n".join(texts),
                    identity,
                    outcome="failed" if message.is_error else "success",
                )
            )
            if not pending:
                if pixels:
                    results.append(sdk.UserPromptPart(pixels))
                result.append(sdk.ModelRequest(results))
                results, pixels = [], []
            continue
        if pending:
            raise invalid_request("The SDK tool-result batch is incomplete.")
        if message.role is ModelRole.ASSISTANT:
            response = _response(message, request.adapter_config, request.model_id)
            for part in response.parts:
                if isinstance(part, sdk.ToolCallPart):
                    if part.tool_call_id in pending:
                        raise invalid_request(
                            "The SDK tool-call identity is duplicated."
                        )
                    pending[part.tool_call_id] = part.tool_name
            result.append(response)
        elif message.role is ModelRole.SYSTEM and not have_input:
            if any(not isinstance(block, TextBlock) for block in message.content):
                raise invalid_request("System messages may only contain text.")
            result.append(
                sdk.ModelRequest(
                    [
                        sdk.SystemPromptPart(
                            "".join(block.text for block in message.content)
                        )
                    ]
                )
            )
        else:
            have_input = True
            result.append(
                sdk.ModelRequest(
                    [
                        sdk.UserPromptPart(
                            [
                                part
                                for block in message.content
                                for part in _input(block, images)
                            ]
                        )
                    ]
                )
            )
    if pending:
        raise invalid_request("The SDK tool-result batch is incomplete.")
    return result
