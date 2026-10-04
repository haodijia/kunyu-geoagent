"""Lossless timed model output, compact attempt records and record-level readers."""

from dataclasses import dataclass
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    model_validator,
)

from kunyu.agent.runtime.content import ContentBlock, ContentBlockType, ReplayEnvelope
from kunyu.agent.runtime.models import (
    BlockEnd,
    BlockStart,
    ModelFinish,
    ModelFinishReason,
    ModelOutput,
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


class BlockStartChunk(StreamValue):
    type: Literal["block-start"] = "block-start"
    index: ChunkIndex
    block_type: ContentBlockType


class BlockEndChunk(StreamValue):
    type: Literal["block-end"] = "block-end"
    index: ChunkIndex
    block: ContentBlock


class UsageChunk(StreamValue):
    type: Literal["usage"] = "usage"
    input_tokens: TokenCount | None
    output_tokens: TokenCount | None
    total_tokens: TokenCount | None


class FinishChunk(StreamValue):
    type: Literal["finish"] = "finish"
    reason: ModelFinishReason
    replay_state: ReplayEnvelope | None = None


type StreamChunk = Annotated[
    TextChunk
    | ToolDeltaChunk
    | BlockStartChunk
    | BlockEndChunk
    | UsageChunk
    | FinishChunk,
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
            index=output.index,
            text=output.text,
        )
    if isinstance(output, ModelToolCallDelta):
        return ToolDeltaChunk(
            index=output.index,
            id=output.call_id,
            name=output.name,
            arguments_delta=output.arguments_delta,
        )
    if isinstance(output, BlockStart):
        return BlockStartChunk(index=output.index, block_type=output.block_type)
    if isinstance(output, BlockEnd):
        return BlockEndChunk(index=output.index, block=output.block)
    if isinstance(output, TokenUsage):
        return UsageChunk(
            input_tokens=output.input_tokens,
            output_tokens=output.output_tokens,
            total_tokens=output.total_tokens,
        )
    if isinstance(output, ModelFinish):
        return FinishChunk(reason=output.reason, replay_state=output.replay_state)
    raise TypeError("Unknown model stream output.")


def chunk_output(chunk: StreamChunk) -> ModelOutput:
    if isinstance(chunk, TextChunk):
        return (
            ReasoningDelta(chunk.index, chunk.text)
            if chunk.type == "reasoning-delta"
            else TextDelta(chunk.index, chunk.text)
        )
    if isinstance(chunk, ToolDeltaChunk):
        return ModelToolCallDelta(
            chunk.index, chunk.id, chunk.name, chunk.arguments_delta
        )
    if isinstance(chunk, BlockStartChunk):
        return BlockStart(chunk.index, chunk.block_type)
    if isinstance(chunk, BlockEndChunk):
        return BlockEnd(chunk.index, chunk.block)
    if isinstance(chunk, UsageChunk):
        return TokenUsage(chunk.input_tokens, chunk.output_tokens, chunk.total_tokens)
    if isinstance(chunk, FinishChunk):
        return ModelFinish(chunk.reason, chunk.replay_state)
    raise TypeError("Unknown stored model stream chunk.")


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
                    ReasoningDelta(record.index, text)
                    if record.type == "reasoning-chunks"
                    else TextDelta(record.index, text)
                )
            else:
                output = ModelToolCallDelta(record.index, record.id, record.name, text)
            result.append(TimedModelOutput(time, output))
    return tuple(result)


def first_token_time(stream: tuple[AssistantStreamRecord, ...]) -> int | None:
    for record in stream:
        if isinstance(record, RawChunk):
            chunk = record.chunk
            if (
                isinstance(chunk, TextChunk)
                and chunk.text
                or isinstance(chunk, ToolDeltaChunk)
                and (chunk.arguments_delta or chunk.name is not None)
                or isinstance(chunk, BlockEndChunk)
                and (chunk.block.type == "tool-call" or chunk.block.text)
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
