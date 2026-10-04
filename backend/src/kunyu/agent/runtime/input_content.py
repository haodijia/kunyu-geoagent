"""Input attachment references are distinct from model response blocks."""

from typing import Annotated, Literal

from pydantic import Field

from kunyu.agent.runtime.content import ContentBlock, ContentValue, TextBlock
from kunyu.domain.attachments import Attachment, FileAttachment, ImageAttachment


class ImageInputBlock(ContentValue):
    type: Literal["image"] = "image"
    attachment: ImageAttachment


class FileInputBlock(ContentValue):
    type: Literal["file"] = "file"
    attachment: FileAttachment


type MessageContentBlock = Annotated[
    ContentBlock | ImageInputBlock | FileInputBlock, Field(discriminator="type")
]


def user_content(
    text: str, attachments: tuple[Attachment, ...]
) -> tuple[MessageContentBlock, ...]:
    return (
        *((TextBlock(text=text),) if text else ()),
        *(
            ImageInputBlock(attachment=ref)
            if ref.kind == "image"
            else FileInputBlock(attachment=ref)
            for ref in attachments
        ),
    )
