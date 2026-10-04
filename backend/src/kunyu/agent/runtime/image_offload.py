"""Durable occurrence selection and immutable request-history projection."""

from collections.abc import Iterable
from dataclasses import replace

from kunyu.agent.runtime.events import ImageOffloadTarget
from kunyu.agent.runtime.input_content import ImageInputBlock
from kunyu.agent.runtime.models import ModelMessage
from kunyu.domain.attachments import ImageAttachment, attachment_path


def apply_offloads(
    messages: tuple[ModelMessage, ...], targets: tuple[ImageOffloadTarget, ...]
) -> tuple[ModelMessage, ...]:
    selected: dict[tuple[int, str], set[int]] = {}
    for target in targets:
        selected.setdefault((target.sequence, target.message_id), set()).update(
            target.image_indexes
        )
    result = []
    for message in messages:
        source = message.input_source
        indexes = (
            set()
            if source is None
            else selected.get((source.sequence, source.message_id), set())
        )
        if not indexes:
            result.append(message)
            continue
        image_index = 0
        content = []
        for block in message.content:
            if isinstance(block, ImageInputBlock):
                if image_index in indexes:
                    block = block.model_copy(update={"offloaded": True})
                image_index += 1
            content.append(block)
        result.append(replace(message, content=tuple(content)))
    return tuple(result)


def select_oldest_images(
    messages: Iterable[ModelMessage], count: int
) -> tuple[ImageOffloadTarget, ...]:
    if type(count) is not int or count < 1:
        raise ValueError("Image offload selection requires a positive count.")
    targets = []
    for message in messages:
        if count == 0:
            break
        if message.role.value not in {"user", "tool"} or message.input_source is None:
            continue
        image_index = 0
        indexes = []
        for block in message.content:
            if not isinstance(block, ImageInputBlock):
                continue
            if count and block.offloaded is not True:
                indexes.append(image_index)
                count -= 1
            image_index += 1
        if indexes:
            targets.append(
                ImageOffloadTarget(
                    sequence=message.input_source.sequence,
                    message_id=message.input_source.message_id,
                    image_indexes=tuple(indexes),
                )
            )
    return tuple(targets)


def offloaded_image_text(ref: ImageAttachment) -> str:
    return (
        f"[image omitted to fit request image limits; file_path={attachment_path(ref)!r}, "
        f"name={ref.name!r}, normalized={ref.width}x{ref.height}px, "
        f"media_type={ref.media_type}, bytes={ref.bytes}. "
        "Use read_image with this file_path to inspect its pixels again.]"
    )
