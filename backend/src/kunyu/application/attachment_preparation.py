"""Validate complete upload batches before publishing any durable attachment."""

import base64
import binascii
import math
import re
import warnings
from dataclasses import dataclass
from io import BytesIO
from typing import Literal
from uuid import UUID

from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field

from kunyu.domain.attachments import (
    MAX_ATTACHMENT_BYTES,
    MAX_ATTACHMENTS,
    MAX_BATCH_BYTES,
    Attachment,
    AttachmentError,
    FileAttachment,
    ImageAttachment,
)

IMAGE_TYPES = {
    "PNG": "image/png",
    "JPEG": "image/jpeg",
    "WEBP": "image/webp",
    "GIF": "image/gif",
}
MAX_SOURCE_PIXELS = 40_000_000
MAX_IMAGE_PIXELS = 2_000_000


class AttachmentUpload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    kind: Literal["image", "file"]
    name: str = Field(min_length=1, max_length=1024)
    media_type: str | None = Field(default=None, max_length=100)
    data_base64: str = Field(max_length=((MAX_ATTACHMENT_BYTES + 2) // 3) * 4)


@dataclass(frozen=True, slots=True)
class PreparedAttachment:
    ref: Attachment
    data: bytes
    # The upload identity also binds exact source bytes and declared metadata.
    # Images may normalize to equal bytes; different source uploads still conflict.
    source: bytes
    source_media_type: str | None


def display_name(value: str) -> str:
    leaf = re.split(r"[/\\]", value)[-1]
    clean = re.sub(r'[\x00-\x1f\x7f<>:"|?*]', "", leaf).strip().rstrip(". ")
    try:
        while len(clean.encode("utf-8")) > 255:
            clean = clean[:-1]
    except UnicodeEncodeError as error:
        raise AttachmentError(
            "INVALID_ATTACHMENT", "Attachment name must be valid Unicode."
        ) from error
    clean = clean.rstrip(". ")
    if not clean or clean in {".", ".."}:
        raise AttachmentError(
            "INVALID_ATTACHMENT", "Attachment name must contain a filename."
        )
    return clean


def prepare_batch(uploads: list[AttachmentUpload]) -> tuple[PreparedAttachment, ...]:
    if not 1 <= len(uploads) <= MAX_ATTACHMENTS or len(
        {item.id for item in uploads}
    ) != len(uploads):
        raise AttachmentError(
            "INVALID_ATTACHMENT", "Choose 1–8 distinct attachment identities."
        )
    prepared = []
    total = 0
    for upload in uploads:
        try:
            data = base64.b64decode(upload.data_base64, validate=True)
        except (binascii.Error, ValueError) as error:
            raise AttachmentError(
                "INVALID_ATTACHMENT", "Attachment data must be canonical base64."
            ) from error
        if base64.b64encode(data).decode("ascii") != upload.data_base64:
            raise AttachmentError(
                "INVALID_ATTACHMENT", "Attachment data must be canonical base64."
            )
        total += len(data)
        if len(data) > MAX_ATTACHMENT_BYTES or total > MAX_BATCH_BYTES:
            raise AttachmentError(
                "ATTACHMENT_TOO_LARGE", "Attachments exceed the upload byte limit.", 413
            )
        name = display_name(upload.name)
        if upload.kind == "image":
            ref, normalized = normalize_image(
                str(upload.id), name, upload.media_type, data
            )
        else:
            if upload.media_type is not None:
                raise AttachmentError(
                    "INVALID_ATTACHMENT",
                    "Verbatim files do not declare an image media type.",
                )
            ref, normalized = (
                FileAttachment(id=str(upload.id), name=name, bytes=len(data)),
                data,
            )
        prepared.append(PreparedAttachment(ref, normalized, data, upload.media_type))
    if sum(item.ref.bytes for item in prepared) > MAX_BATCH_BYTES:
        raise AttachmentError(
            "ATTACHMENT_TOO_LARGE",
            "Normalized attachments exceed the batch byte limit.",
            413,
        )
    return tuple(prepared)


def normalize_image(
    identity: str, name: str, media_type: str | None, data: bytes
) -> tuple[ImageAttachment, bytes]:
    if not data or media_type not in IMAGE_TYPES.values():
        raise AttachmentError("INVALID_IMAGE", "Choose a PNG, JPEG, WebP or GIF image.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as source:
                if IMAGE_TYPES.get(source.format) != media_type:
                    raise AttachmentError(
                        "INVALID_IMAGE",
                        "Image bytes do not match the declared media type.",
                    )
                if source.width * source.height > MAX_SOURCE_PIXELS:
                    raise AttachmentError(
                        "IMAGE_TOO_LARGE",
                        "Image dimensions exceed the decoding limit.",
                        413,
                    )
                source.seek(0)
                source.load()
                image = ImageOps.exif_transpose(source)
                original_width, original_height = image.size
                alpha = (
                    image.convert("RGBA").getchannel("A")
                    if image.has_transparency_data
                    else None
                )
                icc = source.info.get("icc_profile")
                if icc:
                    image = ImageCms.profileToProfile(
                        (
                            image
                            if image.mode in {"RGB", "CMYK", "L", "LAB"}
                            else image.convert("RGB")
                        ),
                        ImageCms.ImageCmsProfile(BytesIO(icc)),
                        ImageCms.createProfile("sRGB"),
                        outputMode="RGB",
                    )
                else:
                    image = image.convert("RGB")
                if alpha is not None:
                    image.putalpha(alpha)
                scale = min(
                    1,
                    2048 / max(image.size),
                    math.sqrt(MAX_IMAGE_PIXELS / (image.width * image.height)),
                )
                if scale < 1:
                    image = image.resize(
                        (
                            max(1, math.floor(image.width * scale)),
                            max(1, math.floor(image.height * scale)),
                        ),
                        Image.Resampling.LANCZOS,
                    )
                # Copy pixel data into an image with no inherited EXIF, ICC or comments.
                clean = Image.frombytes(image.mode, image.size, image.tobytes())
                buffer = BytesIO()
                output_type = (
                    "image/png"
                    if alpha is not None or media_type != "image/jpeg"
                    else "image/jpeg"
                )
                if output_type == "image/png":
                    clean.save(buffer, format="PNG")
                else:
                    clean.save(buffer, format="JPEG", quality=90)
                normalized = buffer.getvalue()
                if len(normalized) > MAX_ATTACHMENT_BYTES:
                    raise AttachmentError(
                        "ATTACHMENT_TOO_LARGE",
                        "Normalized image exceeds the byte limit.",
                        413,
                    )
                return ImageAttachment(
                    id=identity,
                    name=name,
                    bytes=len(normalized),
                    media_type=output_type,
                    width=clean.width,
                    height=clean.height,
                    original_width=original_width,
                    original_height=original_height,
                ), normalized
    except AttachmentError:
        raise
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombWarning,
        Image.DecompressionBombError,
        ImageCms.PyCMSError,
    ) as error:
        raise AttachmentError(
            "INVALID_IMAGE", "The image could not be decoded and normalized."
        ) from error
