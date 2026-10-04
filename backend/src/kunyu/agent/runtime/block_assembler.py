"""One first-seen assembly order for completed content and safe interruption."""

from dataclasses import dataclass, field

from kunyu.agent.runtime.content import (
    ContentBlock,
    ContentBlockType,
    ReasoningBlock,
    ReplayEnvelope,
    TextBlock,
    ToolCallBlock,
)
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


@dataclass(slots=True)
class _Partial:
    kind: ContentBlockType
    text: list[str] = field(default_factory=list)
    arguments: list[str] = field(default_factory=list)
    id: str | None = None
    name: str | None = None
    block: ContentBlock | None = None


class BlockAssembler:
    def __init__(self) -> None:
        self._partials: dict[int, _Partial] = {}
        self.usage: TokenUsage | None = None
        self.finish: ModelFinishReason | None = None
        self._replay: ReplayEnvelope | None = None

    def _ensure(self, index: int, kind: ContentBlockType) -> _Partial:
        if isinstance(index, bool) or not isinstance(index, int) or index < 0:
            raise ValueError("Model block index must be a nonnegative integer.")
        partial = self._partials.get(index)
        if partial is None:
            partial = _Partial(kind)
            self._partials[index] = partial
        if partial.kind != kind:
            raise ValueError("Model block index changed its content type.")
        return partial

    def push(self, output: ModelOutput) -> None:
        if self.finish is not None:
            raise ValueError("Model output followed its terminal finish.")
        if isinstance(output, BlockStart):
            if output.index in self._partials:
                raise ValueError("Model block was started more than once.")
            self._ensure(output.index, output.block_type)
        elif isinstance(output, (TextDelta, ReasoningDelta)):
            partial = self._ensure(
                output.index,
                "reasoning" if isinstance(output, ReasoningDelta) else "text",
            )
            if partial.block is not None:
                raise ValueError("Model delta followed block closure.")
            partial.text.append(output.text)
        elif isinstance(output, ModelToolCallDelta):
            partial = self._ensure(output.index, "tool-call")
            if partial.block is not None:
                raise ValueError("Tool delta followed block closure.")
            partial.id = output.call_id
            if output.name is not None:
                partial.name = output.name
            partial.arguments.append(output.arguments_delta)
        elif isinstance(output, BlockEnd):
            partial = self._ensure(output.index, output.block.type)
            if partial.block is not None:
                raise ValueError("Model block was closed more than once.")
            if (
                isinstance(output.block, (TextBlock, ReasoningBlock))
                and partial.text
                and "".join(partial.text) != output.block.text
            ):
                raise ValueError("Closed block differs from its observed deltas.")
            if isinstance(output.block, ToolCallBlock) and (
                partial.id is not None
                and partial.id != output.block.id
                or partial.name is not None
                and partial.name != output.block.name
                or partial.arguments
                and "".join(partial.arguments) != output.block.arguments
            ):
                raise ValueError("Closed tool block differs from its observed deltas.")
            partial.block = output.block
        elif isinstance(output, TokenUsage):
            if self.usage is not None:
                raise ValueError("Model usage was reported more than once.")
            self.usage = output
        elif isinstance(output, ModelFinish):
            self.finish, self._replay = output.reason, output.replay_state
        else:
            raise TypeError("Unknown model output.")

    @staticmethod
    def _block(partial: _Partial) -> ContentBlock:
        if partial.block is not None:
            return partial.block
        if partial.kind == "text":
            return TextBlock(text="".join(partial.text))
        if partial.kind == "reasoning":
            return ReasoningBlock(text="".join(partial.text))
        if not partial.id or not partial.name:
            raise ValueError("Model tool block has no complete identity.")
        return ToolCallBlock(
            id=partial.id, name=partial.name, arguments="".join(partial.arguments)
        )

    def observed_text(self, index: int) -> str:
        return "".join(self._partials[index].text)

    def blocks(
        self, *, interrupted: bool = False, output_limit: int | None = None
    ) -> tuple[ContentBlock, ...]:
        result: list[ContentBlock] = []
        remaining = output_limit
        for partial in self._partials.values():
            if partial.kind == "tool-call" and (
                interrupted or self.finish is ModelFinishReason.LENGTH
            ):
                continue
            block = self._block(partial)
            if isinstance(block, (TextBlock, ReasoningBlock)):
                if remaining is not None:
                    text = block.text[:remaining]
                    remaining -= len(text)
                    if block.text and not text:
                        continue
                    block = block.model_copy(update={"text": text})
                if interrupted and not block.text.strip():
                    continue
            result.append(block)
        return tuple(result)

    @property
    def replay_state(self) -> ReplayEnvelope | None:
        envelope = self._replay
        if envelope is None or envelope.blocks is None:
            return envelope
        partials = tuple(self._partials.values())
        if len(envelope.blocks) != len(partials):
            return None
        if self.finish is not ModelFinishReason.LENGTH:
            return envelope
        return ReplayEnvelope(
            response=envelope.model_dump(mode="json")["response"],
            blocks=tuple(
                value
                for partial, value in zip(
                    partials, envelope.model_dump(mode="json")["blocks"], strict=True
                )
                if partial.kind != "tool-call"
            ),
        )
