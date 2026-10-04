"""Durable, session-owned attachment receipts; bytes stay outside the journal."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_ATTACHMENTS = 8
MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024
MAX_BATCH_BYTES = 32 * 1024 * 1024


class AttachmentRef(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    name: str = Field(min_length=1, max_length=255)
    bytes: int = Field(strict=True, ge=0, le=MAX_ATTACHMENT_BYTES)

    @field_validator("id")
    @classmethod
    def canonical_id(cls, value: str) -> str:
        if str(UUID(value)) != value:
            raise ValueError("Attachment identity must be a canonical UUID.")
        return value


class FileAttachment(AttachmentRef):
    kind: Literal["file"] = "file"


class ToolImageProducer(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)
    run_id: str = Field(min_length=1, max_length=64)
    tool_call_id: str = Field(min_length=1, max_length=64)


class ImageAttachment(AttachmentRef):
    bytes: int = Field(strict=True, gt=0, le=MAX_ATTACHMENT_BYTES)
    kind: Literal["image"] = "image"
    media_type: Literal["image/png", "image/jpeg"]
    width: int = Field(strict=True, gt=0, le=2048)
    height: int = Field(strict=True, gt=0, le=2048)
    original_width: int = Field(strict=True, gt=0)
    original_height: int = Field(strict=True, gt=0)
    producer: ToolImageProducer | None = Field(
        default=None, exclude_if=lambda value: value is None
    )


type Attachment = Annotated[
    FileAttachment | ImageAttachment, Field(discriminator="kind")
]


def attachment_path(ref: Attachment) -> str:
    return f"/attachments/{ref.id}/{ref.name}"


class AttachmentError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 422) -> None:
        self.code = code
        self.status = status
        super().__init__(message)
