"""Canonical model content and opaque, block-aligned replay metadata."""

import json
from collections.abc import Mapping
from types import MappingProxyType
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    field_serializer,
    field_validator,
)


class ContentValue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class TextBlock(ContentValue):
    type: Literal["text"] = "text"
    text: str = Field(strict=True)


class ReasoningBlock(ContentValue):
    type: Literal["reasoning"] = "reasoning"
    text: str = Field(strict=True)


class ToolCallBlock(ContentValue):
    type: Literal["tool-call"] = "tool-call"
    id: str = Field(strict=True, min_length=1, max_length=256)
    name: str = Field(strict=True, min_length=1, max_length=256)
    arguments: str = Field(strict=True)


type ContentBlock = Annotated[
    TextBlock | ReasoningBlock | ToolCallBlock, Field(discriminator="type")
]
type ContentBlockType = Literal["text", "reasoning", "tool-call"]


def _json_data(value: object) -> object:
    if isinstance(value, Mapping):
        if not all(isinstance(key, str) for key in value):
            raise TypeError("Model JSON object keys must be strings.")
        return {key: _json_data(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_data(item) for item in value]
    return value


def _freeze_json(value: object) -> object:
    if isinstance(value, Mapping):
        return MappingProxyType(
            {key: _freeze_json(item) for key, item in value.items()}
        )
    if isinstance(value, (list, tuple)):
        return tuple(_freeze_json(item) for item in value)
    return value


class ReplayEnvelope(ContentValue):
    response: JsonValue
    blocks: tuple[JsonValue, ...] | None = None

    @field_validator("response", "blocks", mode="before")
    @classmethod
    def normalize(cls, value: object) -> object:
        return _json_data(value)

    @field_validator("response", "blocks", mode="after")
    @classmethod
    def detach(cls, value: object) -> object:
        json.dumps(value, allow_nan=False)
        return _freeze_json(value)

    @field_serializer("response", "blocks")
    def serialize(self, value: object) -> object:
        return _json_data(value)


def content_text(blocks: tuple[ContentValue, ...], *, reasoning: bool = False) -> str:
    kind = ReasoningBlock if reasoning else TextBlock
    return "".join(block.text for block in blocks if isinstance(block, kind))


def content_codepoints(blocks: tuple[ContentBlock, ...]) -> int:
    return sum(
        len(block.text)
        for block in blocks
        if isinstance(block, (TextBlock, ReasoningBlock))
    )


def text_content(text: str) -> tuple[ContentBlock, ...]:
    return (TextBlock(text=text),)
