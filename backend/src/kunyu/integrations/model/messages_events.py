"""Translate native Messages events to ordered model blocks and signed replay."""

import json
from dataclasses import dataclass

from pydantic import ValidationError

from kunyu.agent.runtime.content import (
    ContentBlock,
    ReasoningBlock,
    ReplayEnvelope,
    TextBlock,
    ToolCallBlock,
)
from kunyu.agent.runtime.models import (
    BlockEnd,
    BlockStart,
    ModelAdapterError,
    ModelErrorCode,
    ModelFinish,
    ModelFinishReason,
    ModelOutput,
    ModelToolCallDelta,
    ReasoningDelta,
    TextDelta,
    TokenUsage,
)
from kunyu.integrations.model.context_overflow import is_context_overflow


def protocol_error(detail: str) -> ModelAdapterError:
    return ModelAdapterError(
        ModelErrorCode.PROVIDER_PROTOCOL, f"Messages stream: {detail}"
    )


def object_field(value: object) -> dict:
    if not isinstance(value, dict):
        raise protocol_error("Expected a JSON object.")
    return value


def string_field(value: object) -> str:
    if not isinstance(value, str):
        raise protocol_error("Expected a string field.")
    return value


def reject_constant(value: str) -> None:
    raise protocol_error("Non-finite JSON numbers are unsupported.")


@dataclass(slots=True)
class _Block:
    index: int
    content: ContentBlock
    replay: dict[str, str]
    closed: bool = False
    arguments: str = ""


class MessagesEventMapper:
    def __init__(self, model_id: str) -> None:
        self._model_id = model_id
        self._blocks: dict[int, _Block] = {}
        self._usage = {"input_tokens": 0, "output_tokens": 0}
        self._started = False
        self._reason: ModelFinishReason | None = None
        self.complete = False

    def push(self, event: dict) -> tuple[ModelOutput, ...]:
        if self.complete:
            raise protocol_error("An event followed message_stop.")
        try:
            event = object_field(event)
            return self._event(event)
        except (ValueError, ValidationError) as error:
            raise protocol_error("Invalid event data.") from error

    def end(self) -> tuple[ModelOutput, ...]:
        raise protocol_error("Stream ended before message_stop.")

    def _update_usage(self, raw: object) -> None:
        usage = object_field(raw)
        for name in (
            "input_tokens",
            "output_tokens",
            "cache_read_input_tokens",
            "cache_creation_input_tokens",
        ):
            if name not in usage:
                continue
            value = usage[name]
            if type(value) is not int or not 0 <= value <= 9_007_199_254_740_991:
                raise protocol_error(f"Invalid {name}.")
            self._usage[name] = value

    def _event(self, event: dict) -> tuple[ModelOutput, ...]:
        kind = string_field(event.get("type"))
        if kind == "error":
            detail = object_field(event.get("error"))
            error_type = string_field(detail.get("type"))
            if is_context_overflow(detail):
                raise ModelAdapterError(
                    ModelErrorCode.CONTEXT_WINDOW_EXCEEDED,
                    "The provider reported a context window overflow.",
                )
            code = {
                "authentication_error": ModelErrorCode.PROVIDER_AUTH,
                "permission_error": ModelErrorCode.PROVIDER_AUTH,
                "rate_limit_error": ModelErrorCode.PROVIDER_RATE_LIMIT,
                "invalid_request_error": ModelErrorCode.INVALID_REQUEST,
                "overloaded_error": ModelErrorCode.PROVIDER_SERVER,
                "api_error": ModelErrorCode.PROVIDER_SERVER,
            }.get(error_type, ModelErrorCode.PROVIDER_SERVER)
            raise ModelAdapterError(code, "The provider reported an in-stream error.")
        if kind == "message_start":
            if self._started:
                raise protocol_error("Duplicate message_start.")
            self._update_usage(object_field(event.get("message")).get("usage"))
            self._started = True
            return ()
        if kind not in {
            "content_block_start",
            "content_block_delta",
            "content_block_stop",
            "message_delta",
            "message_stop",
        }:
            return ()
        if not self._started:
            raise protocol_error("Event precedes message_start.")
        if kind == "message_delta":
            delta = object_field(event.get("delta"))
            reason = delta.get("stop_reason")
            if reason is not None:
                reasons = {
                    "end_turn": ModelFinishReason.STOP,
                    "stop_sequence": ModelFinishReason.STOP,
                    "tool_use": ModelFinishReason.TOOL_CALLS,
                    "max_tokens": ModelFinishReason.LENGTH,
                }
                if not isinstance(reason, str) or reason not in reasons:
                    raise protocol_error("Unsupported stop reason.")
                self._reason = reasons[reason]
            if "usage" in event:
                self._update_usage(event["usage"])
            return ()
        if kind == "message_stop":
            return self._finish()
        wire = event.get("index")
        if type(wire) is not int or not 0 <= wire <= 9_007_199_254_740_991:
            raise protocol_error("Invalid block index.")
        if kind == "content_block_start":
            return self._start(wire, object_field(event.get("content_block")))
        block = self._blocks.get(wire)
        if block is None or block.closed:
            raise protocol_error("Delta or stop requires an open block.")
        if kind == "content_block_stop":
            if isinstance(block.content, ToolCallBlock) and block.arguments:
                block.content = block.content.model_copy(
                    update={"arguments": block.arguments}
                )
            block.closed = True
            return (BlockEnd(block.index, block.content),)
        return self._delta(block, object_field(event.get("delta")))

    def _start(self, wire: int, raw: dict) -> tuple[ModelOutput, ...]:
        if wire in self._blocks or self._reason is not None:
            raise protocol_error("Block index repeats or starts after settlement.")
        index = len(self._blocks)
        kind = raw.get("type")
        if kind == "text":
            content = TextBlock(text=string_field(raw.get("text")))
        elif kind == "thinking":
            content = ReasoningBlock(text=string_field(raw.get("thinking")))
        elif kind == "tool_use":
            content = ToolCallBlock(
                id=string_field(raw.get("id")),
                name=string_field(raw.get("name")),
                arguments=json.dumps(
                    object_field(raw.get("input")),
                    ensure_ascii=False,
                    allow_nan=False,
                    separators=(",", ":"),
                ),
            )
        else:
            raise protocol_error("Unsupported content block type.")
        replay = {"type": content.type}
        if kind == "thinking" and "signature" in raw:
            replay["signature"] = string_field(raw["signature"])
        self._blocks[wire] = _Block(index, content, replay)
        outputs: list[ModelOutput] = [BlockStart(index, content.type)]
        if isinstance(content, ToolCallBlock):
            outputs.append(ModelToolCallDelta(index, content.id, content.name, ""))
        elif content.text:
            outputs.append(
                (TextDelta if isinstance(content, TextBlock) else ReasoningDelta)(
                    index, content.text
                )
            )
        return tuple(outputs)

    def _delta(self, block: _Block, raw: dict) -> tuple[ModelOutput, ...]:
        content = block.content
        kind = raw.get("type")
        if kind == "text_delta" and isinstance(content, TextBlock):
            text = string_field(raw.get("text"))
            block.content = TextBlock(text=content.text + text)
            return (TextDelta(block.index, text),)
        if kind == "thinking_delta" and isinstance(content, ReasoningBlock):
            text = string_field(raw.get("thinking"))
            block.content = ReasoningBlock(text=content.text + text)
            return (ReasoningDelta(block.index, text),)
        if kind == "signature_delta" and isinstance(content, ReasoningBlock):
            block.replay["signature"] = block.replay.get(
                "signature", ""
            ) + string_field(raw.get("signature"))
            return ()
        if kind == "input_json_delta" and isinstance(content, ToolCallBlock):
            text = string_field(raw.get("partial_json"))
            block.arguments += text
            return (ModelToolCallDelta(block.index, content.id, None, text),)
        raise protocol_error("Delta type does not match its block.")

    def _finish(self) -> tuple[ModelOutput, ...]:
        if self._reason is None or any(not b.closed for b in self._blocks.values()):
            raise protocol_error(
                "message_stop requires settled blocks and a stop reason."
            )
        if not self._blocks and self._reason is ModelFinishReason.STOP:
            raise ModelAdapterError(
                ModelErrorCode.EMPTY_RESPONSE, "The provider returned no content."
            )
        if self._reason is not ModelFinishReason.LENGTH:
            for block in self._blocks.values():
                if isinstance(block.content, ToolCallBlock):
                    try:
                        object_field(
                            json.loads(
                                block.content.arguments, parse_constant=reject_constant
                            )
                        )
                    except ValueError as error:
                        raise protocol_error("Tool input is invalid JSON.") from error
        self.complete = True
        return (
            TokenUsage(
                self._usage["input_tokens"],
                self._usage["output_tokens"],
                sum(self._usage.values()),
                self._usage.get("cache_read_input_tokens"),
                self._usage.get("cache_creation_input_tokens"),
            ),
            ModelFinish(
                self._reason,
                ReplayEnvelope(
                    response={
                        "kind": "deepseek-messages",
                        "version": 1,
                        "model": self._model_id,
                    },
                    blocks=tuple(block.replay for block in self._blocks.values()),
                ),
            ),
        )
