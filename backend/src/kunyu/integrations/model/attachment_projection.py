"""Provider-neutral attachment materialization; journals contain references only."""

import base64
import json
from collections.abc import Mapping

from kunyu.agent.runtime.content import TextBlock
from kunyu.agent.runtime.image_offload import offloaded_image_text
from kunyu.agent.runtime.input_content import FileInputBlock, ImageInputBlock
from kunyu.domain.attachments import attachment_path
from kunyu.integrations.model.connection import invalid_request
from kunyu.integrations.model.request_images import RequestImage


def input_block(
    block: TextBlock | FileInputBlock | ImageInputBlock,
    images: Mapping[str, RequestImage],
    *,
    native: bool,
) -> dict:
    if isinstance(block, TextBlock):
        return {"type": "text", "text": block.text}
    if isinstance(block, FileInputBlock):
        return {
            "type": "text",
            "text": "Attached file (use read with this file_path): "
            + json.dumps(
                {
                    "file_path": attachment_path(block.attachment),
                    "name": block.attachment.name,
                    "bytes": block.attachment.bytes,
                },
                ensure_ascii=False,
            ),
        }
    if isinstance(block, ImageInputBlock):
        ref = block.attachment
        if ref.id not in images or images[ref.id].attachment != ref:
            raise invalid_request(
                "Image bytes are missing or differ from their receipt."
            )
        data = base64.b64encode(images[ref.id].data).decode("ascii")
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


def image_handle(block: ImageInputBlock, images: Mapping[str, RequestImage]) -> dict:
    image = images.get(block.attachment.id)
    if image is None or image.attachment != block.attachment:
        raise invalid_request("Image request projection is missing.")
    return {
        "type": "text",
        "text": "Attached image: "
        + json.dumps(
            {
                "attachment_id": image.attachment.id,
                "name": image.attachment.name,
                "width": image.width,
                "height": image.height,
                "bytes": len(image.data),
            },
            ensure_ascii=False,
        ),
    }


def input_blocks(
    block: TextBlock | FileInputBlock | ImageInputBlock,
    images: Mapping[str, RequestImage],
    *,
    native: bool,
) -> list[dict]:
    if isinstance(block, ImageInputBlock) and block.offloaded is True:
        return [{"type": "text", "text": offloaded_image_text(block.attachment)}]
    encoded = input_block(block, images, native=native)
    return (
        [image_handle(block, images), encoded]
        if isinstance(block, ImageInputBlock)
        else [encoded]
    )
