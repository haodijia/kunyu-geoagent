"""Materialize retained images with a declared, deterministic request policy."""

import io
from collections.abc import Mapping
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError

from kunyu.agent.runtime.input_content import ImageInputBlock
from kunyu.agent.runtime.models import ModelAdapterError, ModelErrorCode, ModelMessage
from kunyu.domain.attachments import ImageAttachment
from kunyu.domain.model_images import ModelImageInput
from kunyu.integrations.model.connection import invalid_request
from kunyu.integrations.model.image_geometry import (
    grid_dimensions,
    long_edge,
    pixel_dimensions,
)

MAX_REQUEST_IMAGES = 600
MAX_INLINE_IMAGE_BYTES = 20 * 1024 * 1024
IMAGE_COUNT_QUANTUM = 20
IMAGE_BYTE_QUANTUM = 10 * 1024 * 1024


def required_image_offload(lengths: list[int]) -> int:
    excess_count = max(0, len(lengths) - MAX_REQUEST_IMAGES)
    excess_bytes = max(0, sum(lengths) - MAX_INLINE_IMAGE_BYTES)
    if excess_count == 0 and excess_bytes == 0:
        return 0
    remove_count = (
        (excess_count + IMAGE_COUNT_QUANTUM - 1) // IMAGE_COUNT_QUANTUM
    ) * IMAGE_COUNT_QUANTUM
    remove_bytes = (
        (excess_bytes + IMAGE_BYTE_QUANTUM - 1) // IMAGE_BYTE_QUANTUM
    ) * IMAGE_BYTE_QUANTUM
    removed = count = 0
    for size in lengths:
        if count >= remove_count and (remove_bytes == 0 or removed > remove_bytes):
            break
        removed += size
        count += 1
    return count


def raise_image_offload(count: int) -> None:
    if count:
        raise ModelAdapterError(
            ModelErrorCode.IMAGE_OFFLOAD_REQUIRED,
            f"Request images require {count} oldest occurrence(s) to be offloaded.",
            offload_images=count,
        )


@dataclass(frozen=True, slots=True)
class RequestImage:
    attachment: ImageAttachment
    data: bytes
    width: int
    height: int


def prepare_image(
    ref: ImageAttachment, data: bytes, policy: ModelImageInput
) -> RequestImage:
    if not policy.enabled:
        raise ModelAdapterError(
            ModelErrorCode.UNSUPPORTED_CAPABILITY,
            "The selected model does not declare image input support.",
        )
    if len(data) != ref.bytes:
        raise invalid_request("Image bytes differ from their receipt.")
    target = (
        grid_dimensions(ref.width, ref.height)
        if policy.pixel_budget is None
        else pixel_dimensions(
            ref.width,
            ref.height,
            512 * 512 if policy.pixel_budget == "low" else policy.pixel_budget,
        )
    )
    target = long_edge(*target, 4096)
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.size != (ref.width, ref.height) or image.format != (
                "PNG" if ref.media_type == "image/png" else "JPEG"
            ):
                raise invalid_request(
                    "Image geometry or media type differs from its receipt."
                )
            image.load()
            if target != image.size:
                projected = image.resize(target, Image.Resampling.LANCZOS)
                buffer = io.BytesIO()
                projected.save(
                    buffer,
                    format=image.format,
                    **({"quality": 90} if image.format == "JPEG" else {}),
                )
                data = buffer.getvalue()
    except (OSError, UnidentifiedImageError, ValueError) as error:
        raise invalid_request("The retained image could not be decoded.") from error
    if len(data) > policy.max_bytes:
        raise ModelAdapterError(
            ModelErrorCode.IMAGE_LIMIT,
            "The projected image exceeds this model's per-image byte limit.",
        )
    return RequestImage(ref, data, *target)


def require_images_fit(
    messages: tuple[ModelMessage, ...],
    images: Mapping[str, RequestImage],
    policy: ModelImageInput,
) -> None:
    lengths = []
    for message in messages:
        for block in message.content:
            if not isinstance(block, ImageInputBlock) or block.offloaded is True:
                continue
            if not policy.enabled:
                raise ModelAdapterError(
                    ModelErrorCode.UNSUPPORTED_CAPABILITY,
                    "The selected model does not declare image input support.",
                )
            image = images.get(block.attachment.id)
            if (
                not isinstance(image, RequestImage)
                or image.attachment != block.attachment
            ):
                raise invalid_request(
                    "A retained image has no matching request projection."
                )
            if not image.data or len(image.data) > policy.max_bytes:
                raise ModelAdapterError(
                    ModelErrorCode.IMAGE_LIMIT, "Image byte limit exceeded."
                )
            lengths.append(4 * ((len(image.data) + 2) // 3))
    raise_image_offload(required_image_offload(lengths))
