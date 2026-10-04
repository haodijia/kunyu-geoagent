"""Canonical model-visible tool results, independent of presentation metadata."""

from typing import Annotated

from pydantic import AfterValidator, Field, TypeAdapter

from kunyu.agent.runtime.content import TextBlock
from kunyu.agent.runtime.input_content import ImageInputBlock
from kunyu.domain.attachments import MAX_ATTACHMENTS, MAX_BATCH_BYTES

type ToolContentBlock = Annotated[
    TextBlock | ImageInputBlock, Field(discriminator="type")
]


def _validate_content(
    blocks: tuple[ToolContentBlock, ...],
) -> tuple[ToolContentBlock, ...]:
    images = [block for block in blocks if isinstance(block, ImageInputBlock)]
    if any(block.offloaded is not None for block in images):
        raise ValueError("New tool images cannot carry offload selections.")
    if (
        len(images) > MAX_ATTACHMENTS
        or sum(block.attachment.bytes for block in images) > MAX_BATCH_BYTES
    ):
        raise ValueError("Tool images exceed attachment count or byte limits.")
    if len({block.attachment.id for block in images}) != len(images):
        raise ValueError("Tool image references must be unique within a result.")
    return blocks


type ToolContent = Annotated[
    tuple[ToolContentBlock, ...], Field(min_length=1), AfterValidator(_validate_content)
]

TOOL_CONTENT_ADAPTER = TypeAdapter(ToolContent)
