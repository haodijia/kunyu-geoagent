"""Strict, ordered MCP content projection into existing durable tool blocks."""

import asyncio
import base64
import json
from uuid import uuid4

from kunyu.agent.runtime.content import TextBlock
from kunyu.agent.runtime.input_content import ImageInputBlock
from kunyu.agent.runtime.tools import ToolCall, ToolExecutionError, ToolResult
from kunyu.agent.tools.shared import load_source
from kunyu.application.attachment_preparation import PreparedAttachment, normalize_image
from kunyu.domain.attachments import MAX_ATTACHMENTS, MAX_BATCH_BYTES, ToolImageProducer
from kunyu.integrations.model.request_images import prepare_image

MAX_RESULT_BYTES = 32 * 1024 * 1024


async def project_result(
    value: dict, call: ToolCall, contexts, attachments, *, resource: bool = False
) -> ToolResult:
    if (
        len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode())
        > MAX_RESULT_BYTES
    ):
        raise ToolExecutionError(
            "MCP result exceeds its limit.", code="MCP_RESULT_TOO_LARGE"
        )
    source = load_source(contexts, call.run_id)
    snapshot = source.run.request_snapshot
    content = []
    prepared = []
    canonical = []
    blocks = value["contents"] if resource else value["content"]
    for block in blocks:
        resource_uri = block["uri"] if resource else None
        if resource:
            if "text" in block:
                content.append(
                    TextBlock(text=f"Resource {block['uri']}:\n{block['text']}")
                )
                canonical.append(block)
                continue
            if "blob" in block:
                block = {
                    "type": "image",
                    "data": block["blob"],
                    "mimeType": block.get("mimeType"),
                }
            else:
                raise ToolExecutionError(
                    "MCP resource has no content.", code="MCP_RESULT_INVALID"
                )
        kind = block.get("type")
        if kind == "text":
            content.append(TextBlock(text=block["text"]))
            canonical.append(block)
        elif kind == "resource_link":
            content.append(
                TextBlock(text=f"Resource link: {block['name']} ({block['uri']})")
            )
            canonical.append(block)
        elif kind == "resource":
            embedded = block["resource"]
            if "text" not in embedded:
                raise ToolExecutionError(
                    "MCP embedded binary resources are unsupported.",
                    code="MCP_UNSUPPORTED_CONTENT",
                )
            content.append(
                TextBlock(text=f"Resource {embedded['uri']}:\n{embedded['text']}")
            )
            canonical.append(block)
        elif kind == "image":
            mime = block.get("mimeType")
            if mime not in {"image/png", "image/jpeg", "image/webp", "image/gif"}:
                raise ToolExecutionError(
                    "MCP image format is unsupported.", code="MCP_UNSUPPORTED_CONTENT"
                )
            if snapshot is None or not snapshot.image_input.enabled:
                raise ToolExecutionError(
                    "The calling model does not declare image input.",
                    code="UNSUPPORTED_CAPABILITY",
                )
            try:
                raw = base64.b64decode(block["data"], validate=True)
                if base64.b64encode(raw).decode() != block["data"]:
                    raise ValueError("Non-canonical base64.")
                suffix = {
                    "image/png": "png",
                    "image/jpeg": "jpg",
                    "image/webp": "webp",
                    "image/gif": "gif",
                }[mime]
                ref, data = await asyncio.to_thread(
                    normalize_image, str(uuid4()), f"mcp-image.{suffix}", mime, raw
                )
                ref = ref.model_copy(
                    update={
                        "producer": ToolImageProducer(
                            run_id=call.run_id, tool_call_id=call.call_id
                        )
                    }
                )
                await asyncio.to_thread(prepare_image, ref, data, snapshot.image_input)
            except Exception:
                raise ToolExecutionError(
                    "MCP image admission failed.", code="MCP_IMAGE_INVALID"
                ) from None
            prepared.append(PreparedAttachment(ref, data, raw, mime))
            if resource_uri is not None:
                content.append(TextBlock(text=f"Resource image: {resource_uri}"))
            content.append(ImageInputBlock(attachment=ref))
            # Durable journals contain a receipt, never duplicate the base64 source.
            canonical.append(
                {
                    **(
                        {"uri": resource_uri, "mimeType": mime}
                        if resource
                        else {"type": "image"}
                    ),
                    "attachment": ref.model_dump(mode="json"),
                }
            )
        else:
            raise ToolExecutionError(
                "MCP returned unsupported content.", code="MCP_UNSUPPORTED_CONTENT"
            )
    if (
        len(prepared) > MAX_ATTACHMENTS
        or sum(item.ref.bytes for item in prepared) > MAX_BATCH_BYTES
    ):
        raise ToolExecutionError(
            "MCP image batch exceeds attachment limits.", code="MCP_RESULT_TOO_LARGE"
        )
    if "structuredContent" in value and not blocks:
        content.append(
            TextBlock(
                text=json.dumps(
                    value["structuredContent"], ensure_ascii=False, allow_nan=False
                )
            )
        )
    if not content:
        raise ToolExecutionError(
            "MCP returned no model-visible content.", code="MCP_EMPTY_RESULT"
        )
    if prepared:
        attachments.save_batch(source.session.id, tuple(prepared))
    result = {"contents" if resource else "content": canonical}
    if "structuredContent" in value:
        result["structuredContent"] = value["structuredContent"]
    return ToolResult(content=tuple(content), result=result)
