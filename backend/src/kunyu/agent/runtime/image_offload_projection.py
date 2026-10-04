"""Validate occurrence references against the current durable input surface."""

from kunyu.agent.runtime.events import (
    EventDraft,
    HistoryCompactedEvent,
    ImageOffloadEvent,
    ImageOffloadTarget,
    RequestHeaderEvent,
    StepDecisionEvent,
    UserMessageAppendedEvent,
)
from kunyu.agent.runtime.input_content import ImageInputBlock, InputMessageSource
from kunyu.domain.attachments import Attachment, ImageAttachment


class ImageOffloadProjection:
    def __init__(self) -> None:
        self._nodes: dict[tuple[int, str], tuple[ImageAttachment, ...]] = {}
        self._selected: dict[tuple[int, str], set[int]] = {}
        self._visible: set[tuple[int, str]] = set()
        self.targets: list[ImageOffloadTarget] = []

    def accept(self, event: EventDraft, sequence: int) -> None:
        if isinstance(event, UserMessageAppendedEvent):
            self._add(sequence, event.payload.message_id, event.payload.attachments)
        elif isinstance(event, StepDecisionEvent):
            replaced = set(event.payload.input_ids)
            self._nodes = {
                key: refs for key, refs in self._nodes.items() if key[1] not in replaced
            }
            if event.payload.kind == "enter":
                for message in event.payload.messages:
                    self._add(sequence, message.message_id, message.attachments)
        elif isinstance(event, HistoryCompactedEvent):
            self._nodes = {
                key: refs
                for key, refs in self._nodes.items()
                if key[0] > event.payload.through_sequence
            }
        elif isinstance(event, RequestHeaderEvent):
            visible = set()
            for message in event.payload.messages:
                source_value = message.get("input_source")
                if source_value is None:
                    continue
                source = InputMessageSource.model_validate(source_value)
                key = (source.sequence, source.message_id)
                content = message.get("content")
                if not isinstance(content, list) or message.get("role") != "user":
                    raise ValueError("A request image source requires user content.")
                blocks = tuple(
                    ImageInputBlock.model_validate(block)
                    for block in content
                    if isinstance(block, dict) and block.get("type") == "image"
                )
                if not blocks:
                    continue
                if key in visible or self._nodes.get(key) != tuple(
                    block.attachment for block in blocks
                ):
                    raise ValueError(
                        "Request image source differs from the current input surface."
                    )
                marked = {
                    index
                    for index, block in enumerate(blocks)
                    if block.offloaded is True
                }
                if marked != self._selected.get(key, set()):
                    raise ValueError(
                        "Request image marks differ from durable offload selections."
                    )
                visible.add(key)
            self._visible = visible
        elif isinstance(event, ImageOffloadEvent):
            for target in event.payload.targets:
                key = (target.sequence, target.message_id)
                refs = self._nodes.get(key)
                if refs is None or key not in self._visible:
                    raise ValueError(
                        "Image offload must reference a current request input node."
                    )
                if any(
                    index >= len(refs) or index in self._selected.get(key, set())
                    for index in target.image_indexes
                ):
                    raise ValueError(
                        "Image offload index is missing or was already offloaded."
                    )
            for target in event.payload.targets:
                self._selected.setdefault(
                    (target.sequence, target.message_id), set()
                ).update(target.image_indexes)
            self.targets.extend(event.payload.targets)

    def _add(
        self, sequence: int, message_id: str, attachments: tuple[Attachment, ...]
    ) -> None:
        self._nodes[(sequence, message_id)] = tuple(
            ref for ref in attachments if ref.kind == "image"
        )
