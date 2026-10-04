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
    text_length: int = 0
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
        partial = self._partials.get(index)
        if partial is None:
            partial = _Partial(kind)
            self._partials[index] = partial
        if partial.kind != kind:
            raise ValueError("Model block index changed its content type.")
        return partial

    def push(self, output: ModelOutput) -> bool:
        """Accept one observation; duplicate starts and closed stragglers are inert."""
        if self.finish is not None:
            raise ValueError("Model output followed its terminal finish.")
        if isinstance(
            output,
            (BlockStart, BlockEnd, TextDelta, ReasoningDelta, ModelToolCallDelta),
        ):
            if (
                isinstance(output.index, bool)
                or not isinstance(output.index, int)
                or output.index < 0
            ):
                raise ValueError("Model block index must be a nonnegative integer.")
            previous = self._partials.get(output.index)
            if previous is not None and (
                isinstance(output, BlockStart) or previous.block is not None
            ):
                return False
        if isinstance(output, BlockStart):
            self._ensure(output.index, output.block_type)
        elif isinstance(output, (TextDelta, ReasoningDelta)):
            partial = self._ensure(
                output.index,
                "reasoning" if isinstance(output, ReasoningDelta) else "text",
            )
            partial.text.append(output.text)
            partial.text_length += len(output.text)
        elif isinstance(output, ModelToolCallDelta):
            partial = self._ensure(output.index, "tool-call")
            partial.id = output.call_id
            if output.name is not None:
                partial.name = output.name
            partial.arguments.append(output.arguments_delta)
        elif isinstance(output, BlockEnd):
            partial = self._partials.get(output.index)
            if partial is None:
                partial = self._ensure(output.index, output.block.type)
            # The first complete block is authoritative, including normalized tool
            # input and providers which only include content in their closing event.
            partial.block = output.block
        elif isinstance(output, TokenUsage):
            if self.usage is not None:
                raise ValueError("Model usage was reported more than once.")
            self.usage = output
        elif isinstance(output, ModelFinish):
            self.finish, self._replay = output.reason, output.replay_state
        else:
            raise TypeError("Unknown model output.")
        return True

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

    def observed_text(self, index: int, kind: ContentBlockType) -> str:
        partial = self._partials[index]
        return "".join(partial.text) if partial.kind == kind else ""

    @property
    def output_codepoints(self) -> int:
        """Count current canonical text without assembling incomplete tool blocks."""
        total = 0
        for partial in self._partials.values():
            if isinstance(partial.block, (TextBlock, ReasoningBlock)):
                total += len(partial.block.text)
            elif partial.block is None and partial.kind in {"text", "reasoning"}:
                total += partial.text_length
        return total

    def blocks(
        self, *, interrupted: bool = False, output_limit: int | None = None
    ) -> tuple[ContentBlock, ...]:
        result: list[ContentBlock] = []
        remaining = output_limit
        for partial in self._partials.values():
            kind = partial.block.type if partial.block is not None else partial.kind
            if kind == "tool-call" and (
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
                if (partial.block.type if partial.block is not None else partial.kind)
                != "tool-call"
            ),
        )
