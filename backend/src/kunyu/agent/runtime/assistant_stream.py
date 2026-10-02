"""Lossless timed model output, compact attempt records and record-level readers."""

import json
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    model_validator,
)

from kunyu.agent.runtime.models import (
    ModelFinish,
    ModelFinishReason,
    ModelOutput,
    ModelToolCall,
    ModelToolCallDelta,
    ReasoningDelta,
    TextDelta,
    TokenUsage,
)

type Milliseconds = Annotated[
    int, Field(strict=True, ge=-9_007_199_254_740_991, le=9_007_199_254_740_991)
]
type ChunkIndex = Annotated[int, Field(strict=True, ge=0, le=9_007_199_254_740_991)]
type TokenCount = Annotated[int, Field(strict=True, ge=0, le=9_007_199_254_740_991)]
type StreamText = Annotated[str, Field(strict=True)]
TIME = TypeAdapter(Milliseconds)


class StreamValue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class TextChunk(StreamValue):
    type: Literal["text-delta", "reasoning-delta"]
    index: ChunkIndex
    text: str = Field(strict=True)


class ToolDeltaChunk(StreamValue):
    type: Literal["tool-call-delta"] = "tool-call-delta"
    index: ChunkIndex
    id: str = Field(strict=True)
    name: StreamText | None
    arguments_delta: str = Field(strict=True)


class ToolChunk(StreamValue):
    type: Literal["tool-call"] = "tool-call"
    call_id: str = Field(strict=True)
    name: str = Field(strict=True)
    arguments: str = Field(strict=True)

    @model_validator(mode="after")
    def validate_arguments(self) -> Self:
        parsed = json.loads(self.arguments)
        if not isinstance(parsed, dict):
            raise ValueError("Tool arguments must encode a JSON object.")  # noqa: TRY004 -- a Pydantic decoded-value validation failure
        json.dumps(parsed, allow_nan=False)
        return self


class UsageChunk(StreamValue):
    type: Literal["usage"] = "usage"
    input_tokens: TokenCount | None
    output_tokens: TokenCount | None
    total_tokens: TokenCount | None


class FinishChunk(StreamValue):
    type: Literal["finish"] = "finish"
    reason: ModelFinishReason


type StreamChunk = Annotated[
    TextChunk | ToolDeltaChunk | ToolChunk | UsageChunk | FinishChunk,
    Field(discriminator="type"),
]


class TextChunks(StreamValue):
    type: Literal["text-chunks", "reasoning-chunks"]
    time0: Milliseconds
    index: ChunkIndex
    dt: tuple[Milliseconds, ...]
    texts: tuple[StreamText, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_members(self) -> Self:
        _validate_run(self.time0, self.dt, len(self.texts))
        return self


class ToolChunks(StreamValue):
    type: Literal["tool-call-chunks"] = "tool-call-chunks"
    time0: Milliseconds
    index: ChunkIndex
    dt: tuple[Milliseconds, ...]
    id: str = Field(min_length=1, strict=True)
    name: StreamText | None
    args: tuple[StreamText, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_members(self) -> Self:
        _validate_run(self.time0, self.dt, len(self.args))
        if self.name == "":
            raise ValueError("Empty tool names must remain raw chunks.")
        return self


class RawChunk(StreamValue):
    type: Literal["chunk"] = "chunk"
    time: Milliseconds
    chunk: StreamChunk


type AssistantStreamRecord = Annotated[
    TextChunks | ToolChunks | RawChunk, Field(discriminator="type")
]
STREAM = TypeAdapter(tuple[AssistantStreamRecord, ...])


def _validate_run(time: int, gaps: tuple[int, ...], members: int) -> None:
    if len(gaps) != members - 1:
        raise ValueError(
            "Packed stream must retain one timestamp gap per additional member."
        )
    for gap in gaps:
        time = TIME.validate_python(time + gap)


@dataclass(frozen=True, slots=True)
class TimedModelOutput:
    time: int
    output: ModelOutput


def snapshot_chunk(output: ModelOutput) -> StreamChunk:
    if isinstance(output, (TextDelta, ReasoningDelta)):
        return TextChunk(
            type="reasoning-delta"
            if isinstance(output, ReasoningDelta)
            else "text-delta",
            index=0,
            text=output.text,
        )
    if isinstance(output, ModelToolCallDelta):
        return ToolDeltaChunk(
            index=output.index,
            id=output.call_id,
            name=output.name,
            arguments_delta=output.arguments_delta,
        )
    if isinstance(output, ModelToolCall):
        # JSON round-trip rejects non-serializable values and detaches nested arguments.
        arguments = json.dumps(
            model_json_data(output.arguments),
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return ToolChunk(call_id=output.call_id, name=output.name, arguments=arguments)
    if isinstance(output, TokenUsage):
        return UsageChunk(
            input_tokens=output.input_tokens,
            output_tokens=output.output_tokens,
            total_tokens=output.total_tokens,
        )
    if isinstance(output, ModelFinish):
        return FinishChunk(reason=output.reason)
    raise TypeError("Unknown model stream output.")


def chunk_output(chunk: StreamChunk) -> ModelOutput:
    if isinstance(chunk, TextChunk):
        return (
            ReasoningDelta(chunk.text)
            if chunk.type == "reasoning-delta"
            else TextDelta(chunk.text)
        )
    if isinstance(chunk, ToolDeltaChunk):
        return ModelToolCallDelta(
            chunk.index, chunk.id, chunk.name, chunk.arguments_delta
        )
    if isinstance(chunk, ToolChunk):
        return ModelToolCall(
            chunk.call_id, chunk.name, _freeze_json(json.loads(chunk.arguments))
        )
    if isinstance(chunk, UsageChunk):
        return TokenUsage(chunk.input_tokens, chunk.output_tokens, chunk.total_tokens)
    if isinstance(chunk, FinishChunk):
        return ModelFinish(chunk.reason)
    raise TypeError("Unknown stored model stream chunk.")


def model_json_data(value: object) -> object:
    if isinstance(value, Mapping):
        if not all(isinstance(key, str) for key in value):
            raise TypeError("Model JSON object keys must be strings.")
        return {key: model_json_data(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [model_json_data(item) for item in value]
    return value


def _freeze_json(value: object) -> object:
    if isinstance(value, Mapping):
        return MappingProxyType(
            {key: _freeze_json(item) for key, item in value.items()}
        )
    if isinstance(value, (list, tuple)):
        return tuple(_freeze_json(item) for item in value)
    return value


class AssistantStreamAccumulator:
    def __init__(self) -> None:
        self._records: list[dict] = []

    def push(self, output: ModelOutput, time: int) -> TimedModelOutput:
        time = TIME.validate_python(time)
        chunk = snapshot_chunk(output)
        previous = self._records[-1] if self._records else None
        if isinstance(chunk, TextChunk):
            kind = "text-chunks" if chunk.type == "text-delta" else "reasoning-chunks"
            members, field, identity = [chunk.text], "texts", {"index": chunk.index}
        elif isinstance(chunk, ToolDeltaChunk) and chunk.id and chunk.name != "":
            kind = "tool-call-chunks"
            members, field, identity = (
                [chunk.arguments_delta],
                "args",
                {"index": chunk.index, "id": chunk.id, "name": chunk.name},
            )
        else:
            self._records.append({"type": "chunk", "time": time, "chunk": chunk})
            return TimedModelOutput(time, chunk_output(chunk))
        gap = (
            time - previous["last_time"]
            if previous is not None and previous["type"] == kind
            else None
        )
        if (
            previous is not None
            and previous["type"] == kind
            and all(previous[key] == value for key, value in identity.items())
            and gap is not None
            and abs(gap) <= 9_007_199_254_740_991
        ):
            previous["dt"].append(gap)
            previous[field].extend(members)
            previous["last_time"] = time
        else:
            self._records.append(
                {
                    "type": kind,
                    "time0": time,
                    **identity,
                    "dt": [],
                    field: members,
                    "last_time": time,
                }
            )
        return TimedModelOutput(time, chunk_output(chunk))

    def snapshot(self) -> tuple[AssistantStreamRecord, ...]:
        return STREAM.validate_python(
            tuple(
                {key: value for key, value in record.items() if key != "last_time"}
                for record in self._records
            )
        )


def expand_assistant_stream(
    stream: tuple[AssistantStreamRecord, ...],
) -> tuple[TimedModelOutput, ...]:
    validated = STREAM.validate_python(
        tuple(record.model_dump(mode="python") for record in stream)
    )
    result = []
    for record in validated:
        if isinstance(record, RawChunk):
            result.append(TimedModelOutput(record.time, chunk_output(record.chunk)))
            continue
        members = record.texts if isinstance(record, TextChunks) else record.args
        time = record.time0
        for index, text in enumerate(members):
            if index > 0:
                time += record.dt[index - 1]
            if isinstance(record, TextChunks):
                output = (
                    ReasoningDelta(text)
                    if record.type == "reasoning-chunks"
                    else TextDelta(text)
                )
            else:
                output = ModelToolCallDelta(record.index, record.id, record.name, text)
            result.append(TimedModelOutput(time, output))
    return tuple(result)


def stream_text(
    stream: tuple[AssistantStreamRecord, ...], *, reasoning: bool = False
) -> str:
    packed_kind = "reasoning-chunks" if reasoning else "text-chunks"
    raw_kind = "reasoning-delta" if reasoning else "text-delta"
    return "".join(
        "".join(record.texts)
        if isinstance(record, TextChunks) and record.type == packed_kind
        else record.chunk.text
        if isinstance(record, RawChunk)
        and isinstance(record.chunk, TextChunk)
        and record.chunk.type == raw_kind
        else ""
        for record in stream
    )


def first_token_time(stream: tuple[AssistantStreamRecord, ...]) -> int | None:
    for record in stream:
        if isinstance(record, RawChunk):
            chunk = record.chunk
            if (
                isinstance(chunk, TextChunk)
                and chunk.text
                or isinstance(chunk, ToolDeltaChunk)
                and (chunk.arguments_delta or chunk.name is not None)
            ):
                return record.time
        else:
            members = record.texts if isinstance(record, TextChunks) else record.args
            time = record.time0
            for index, member in enumerate(members):
                if index > 0:
                    time += record.dt[index - 1]
                if member or isinstance(record, ToolChunks) and record.name is not None:
                    return time
    return None
