import json
from dataclasses import dataclass, field
from typing import Any

from kunyu.agent.runtime.content import (
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

MAX_TOOL_CALLS = 16
MAX_TOOL_ARGUMENT_BYTES = 16 * 1024
MAX_TOOL_IDENTIFIER_LENGTH = 256


@dataclass(slots=True)
class _PartialToolCall:
    call_id_parts: list[str] = field(default_factory=list)
    name_parts: list[str] = field(default_factory=list)
    argument_parts: list[str] = field(default_factory=list)
    argument_bytes: int = 0


class OpenAIChatStreamParser:
    """Strictly assembles one OpenAI Chat Completions SSE response."""

    def __init__(self) -> None:
        self._text_parts: list[str] = []
        self._reasoning_parts: list[str] = []
        self._indexes: dict[tuple[str, int], int] = {}
        self._response: dict[str, object] = {}
        self._tool_calls: dict[int, _PartialToolCall] = {}
        self._usage: TokenUsage | None = None
        self._finish_reason: ModelFinishReason | None = None
        self._complete = False

    @property
    def complete(self) -> bool:
        return self._complete

    def push(self, data: str) -> tuple[ModelOutput, ...]:
        if self._complete:
            raise _protocol_error("The provider sent data after stream completion.")
        if data == "[DONE]":
            return self._finish()
        try:
            payload = json.loads(data)
        except ValueError as error:
            raise _protocol_error(
                "The provider stream contained invalid JSON."
            ) from error
        if isinstance(payload, dict) and is_context_overflow(payload.get("error")):
            raise ModelAdapterError(
                ModelErrorCode.CONTEXT_WINDOW_EXCEEDED,
                "The provider reported a context window overflow.",
            )
        if not isinstance(payload, dict) or "error" in payload:
            raise _protocol_error("The provider stream contained an invalid event.")

        for key in ("id", "model", "created", "system_fingerprint"):
            if key in payload:
                if key in self._response and self._response[key] != payload[key]:
                    raise _protocol_error(
                        "Provider response metadata changed within a stream."
                    )
                self._response[key] = payload[key]
        outputs: list[ModelOutput] = []
        if "usage" in payload and payload["usage"] is not None:
            if self._usage is not None:
                raise _protocol_error("The provider reported usage more than once.")
            self._usage = _parse_usage(payload["usage"])
            outputs.append(self._usage)

        choices = payload.get("choices")
        if not isinstance(choices, list):
            raise _protocol_error("The provider stream event has invalid choices.")
        if not choices:
            if "usage" not in payload or payload["usage"] is None:
                raise _protocol_error("The provider stream event is empty.")
            return tuple(outputs)
        if len(choices) != 1 or not isinstance(choices[0], dict):
            raise _protocol_error("The provider stream must contain one choice.")
        if self._finish_reason is not None:
            raise _protocol_error("The provider sent content after finish_reason.")

        choice = choices[0]
        index = choice.get("index")
        if isinstance(index, bool) or index != 0:
            raise _protocol_error("The provider stream choice index is invalid.")
        delta = choice.get("delta")
        if not isinstance(delta, dict):
            raise _protocol_error("The provider stream delta is invalid.")
        content = delta.get("content")
        reasoning = delta.get("reasoning_content")
        if reasoning is not None:
            if not isinstance(reasoning, str):
                raise _protocol_error("The provider reasoning delta is invalid.")
            if reasoning:
                logical = self._open("reasoning", 0, outputs)
                self._reasoning_parts.append(reasoning)
                outputs.append(ReasoningDelta(logical, reasoning))
        if content is not None:
            if not isinstance(content, str):
                raise _protocol_error("The provider text delta is invalid.")
            if content:
                logical = self._open("text", 0, outputs)
                self._text_parts.append(content)
                outputs.append(TextDelta(logical, content))
        tool_calls = delta.get("tool_calls")
        if tool_calls is not None:
            outputs.extend(self._append_tool_calls(tool_calls))

        finish_reason = choice.get("finish_reason")
        if finish_reason is not None:
            try:
                self._finish_reason = ModelFinishReason(finish_reason)
            except (TypeError, ValueError) as error:
                raise _protocol_error(
                    "The provider returned an unsupported finish_reason."
                ) from error
            outputs.extend(self._close_blocks(self._finish_reason))
        return tuple(outputs)

    def _open(self, kind, provider_index, outputs):
        key = (kind, provider_index)
        if key not in self._indexes:
            self._indexes[key] = len(self._indexes)
            outputs.append(BlockStart(self._indexes[key], kind))
        return self._indexes[key]

    def end(self) -> tuple[ModelOutput, ...]:
        if self._complete:
            return ()
        return self._finish()

    def _append_tool_calls(self, value: Any) -> tuple[ModelOutput, ...]:
        outputs = []
        if not isinstance(value, list):
            raise _protocol_error("The provider tool-call delta is invalid.")
        for item in value:
            if not isinstance(item, dict):
                raise _protocol_error("The provider tool-call delta is invalid.")
            index = item.get("index")
            if isinstance(index, bool) or not isinstance(index, int) or index < 0:
                raise _protocol_error("The provider tool-call index is invalid.")
            if index >= MAX_TOOL_CALLS:
                raise _protocol_error("The provider returned too many tool calls.")
            logical = self._open("tool-call", index, outputs)
            call = self._tool_calls.setdefault(index, _PartialToolCall())
            call_id = item.get("id")
            if call_id is not None:
                if not isinstance(call_id, str):
                    raise _protocol_error("The provider tool-call ID is invalid.")
                call.call_id_parts.append(call_id)
            identity = "".join(call.call_id_parts)
            if len(identity) > MAX_TOOL_IDENTIFIER_LENGTH:
                raise _protocol_error(
                    "The provider tool-call identifier was too large."
                )
            call_type = item.get("type")
            if call_type is not None and call_type != "function":
                raise _protocol_error("The provider tool-call type is invalid.")
            function = item.get("function")
            if function is None:
                outputs.append(ModelToolCallDelta(logical, identity, None, ""))
                continue
            if not isinstance(function, dict):
                raise _protocol_error("The provider tool-call function is invalid.")
            name = function.get("name")
            if name is not None:
                if not isinstance(name, str):
                    raise _protocol_error("The provider tool name is invalid.")
                call.name_parts.append(name)
            arguments = function.get("arguments")
            if arguments is not None:
                if not isinstance(arguments, str):
                    raise _protocol_error("The provider tool arguments are invalid.")
                call.argument_parts.append(arguments)
                call.argument_bytes += len(arguments.encode("utf-8"))
            if call.argument_bytes > MAX_TOOL_ARGUMENT_BYTES:
                raise _protocol_error("The provider tool arguments were too large.")
            full_name = "".join(call.name_parts)
            if len(full_name) > MAX_TOOL_IDENTIFIER_LENGTH:
                raise _protocol_error(
                    "The provider tool-call identifier was too large."
                )
            outputs.append(
                ModelToolCallDelta(
                    logical,
                    identity,
                    full_name if name is not None else None,
                    arguments if arguments is not None else "",
                )
            )
        return tuple(outputs)

    def _finish(self) -> tuple[ModelOutput, ...]:
        reason = self._finish_reason
        if reason is None:
            raise _protocol_error("The provider stream ended without finish_reason.")
        outputs: list[ModelOutput] = []
        has_text = bool("".join(self._text_parts).strip())
        if reason is ModelFinishReason.STOP:
            if self._tool_calls:
                raise _protocol_error(
                    "The provider returned content inconsistent with stop."
                )
            if not has_text:
                raise ModelAdapterError(
                    ModelErrorCode.EMPTY_RESPONSE,
                    "The provider returned an empty response.",
                )
        outputs.append(
            ModelFinish(
                reason,
                ReplayEnvelope(
                    response={
                        "kind": "openai-chat-completions",
                        "version": 1,
                        "native": self._response,
                    }
                ),
            )
        )
        self._complete = True
        return tuple(outputs)

    def _close_blocks(self, reason: ModelFinishReason) -> tuple[ModelOutput, ...]:
        if reason is ModelFinishReason.TOOL_CALLS:
            indexes = sorted(self._tool_calls)
            if not indexes or indexes != list(range(len(indexes))):
                raise _protocol_error("The provider tool-call indexes are incomplete.")
        calls: set[str] = set()
        outputs = []
        for (kind, provider_index), index in self._indexes.items():
            if kind == "text":
                block = TextBlock(text="".join(self._text_parts))
            elif kind == "reasoning":
                block = ReasoningBlock(text="".join(self._reasoning_parts))
            else:
                partial = self._tool_calls[provider_index]
                identity, name = (
                    "".join(partial.call_id_parts),
                    "".join(partial.name_parts),
                )
                arguments = "".join(partial.argument_parts)
                if not identity.strip() or not name.strip():
                    if reason is ModelFinishReason.TOOL_CALLS:
                        raise _protocol_error(
                            "The provider returned an incomplete tool call."
                        )
                    continue
                if identity in calls:
                    raise _protocol_error(
                        "The provider returned duplicate tool-call IDs."
                    )
                calls.add(identity)
                if reason is ModelFinishReason.TOOL_CALLS:
                    try:
                        parsed = json.loads(arguments)
                        if not isinstance(parsed, dict):
                            raise TypeError("Tool arguments must be an object.")
                        json.dumps(parsed, allow_nan=False)
                    except (ValueError, TypeError) as error:
                        raise _protocol_error(
                            "The provider returned invalid tool arguments."
                        ) from error
                block = ToolCallBlock(id=identity, name=name, arguments=arguments)
            outputs.append(BlockEnd(index, block))
        return tuple(outputs)


def _parse_usage(value: Any) -> TokenUsage:
    if not isinstance(value, dict):
        raise _protocol_error("The provider usage record is invalid.")
    details = value.get("prompt_tokens_details")
    if details is not None and not isinstance(details, dict):
        raise _protocol_error("The provider prompt token details are invalid.")
    return TokenUsage(
        input_tokens=_optional_token_count(value.get("prompt_tokens")),
        output_tokens=_optional_token_count(value.get("completion_tokens")),
        total_tokens=_optional_token_count(value.get("total_tokens")),
        cache_read_input_tokens=_optional_token_count(details.get("cached_tokens"))
        if details is not None
        else None,
        cache_creation_input_tokens=_optional_token_count(
            details.get("cache_write_tokens")
        )
        if details is not None
        else None,
    )


def _optional_token_count(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise _protocol_error("The provider usage record is invalid.")
    return value


def _protocol_error(message: str) -> ModelAdapterError:
    return ModelAdapterError(ModelErrorCode.PROVIDER_PROTOCOL, message)
