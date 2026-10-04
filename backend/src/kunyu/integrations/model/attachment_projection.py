"""Provider-neutral attachment materialization; journals contain references only."""

import base64
import json
from collections.abc import Mapping

from kunyu.agent.runtime.content import TextBlock
from kunyu.agent.runtime.input_content import FileInputBlock, ImageInputBlock
from kunyu.integrations.model.connection import invalid_request


def input_block(
    block: TextBlock | FileInputBlock | ImageInputBlock,
    images: Mapping[str, bytes],
    *,
    native: bool,
) -> dict:
    if isinstance(block, TextBlock):
        return {"type": "text", "text": block.text}
    if isinstance(block, FileInputBlock):
        return {
            "type": "text",
            "text": "Attached file (use file_read with this attachment_id): "
            + json.dumps(
                {
                    "attachment_id": block.attachment.id,
                    "name": block.attachment.name,
                    "bytes": block.attachment.bytes,
                },
                ensure_ascii=False,
            ),
        }
    if isinstance(block, ImageInputBlock):
        ref = block.attachment
        if ref.id not in images or len(images[ref.id]) != ref.bytes:
            raise invalid_request(
                "Image bytes are missing or differ from their receipt."
            )
        data = base64.b64encode(images[ref.id]).decode("ascii")
        if native:
            return {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": ref.media_type,
                    "data": data,
                },
            }
        return {
            "type": "image_url",
            "image_url": {"url": f"data:{ref.media_type};base64,{data}"},
        }
    raise invalid_request("Unsupported input content block.")
