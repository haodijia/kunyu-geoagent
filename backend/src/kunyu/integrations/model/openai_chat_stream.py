import json
from dataclasses import dataclass, field
from typing import Any

from dsh.models import (
    ModelAdapterError,
    ModelErrorCode,
    ModelFinish,
    ModelFinishReason,
    ModelOutput,
    ModelToolCall,
    TextDelta,
    TokenUsage,
)

MAX_TOOL_CALLS = 16
MAX_TOOL_ARGUMENT_BYTES = 16 * 1024
MAX_TOOL_IDENTIFIER_LENGTH = 256


@dataclass(slots=True)
class _PartialToolCall:
    call_id_parts: list[str] = field(default_factory=list)
    name_parts: list[str] = field(default_factory=list)
    argument_parts: list[str] = field(default_factory=list)


class OpenAIChatStreamParser:
    """Strictly assembles one OpenAI Chat Completions SSE response."""

    def __init__(self) -> None:
        self._text_parts: list[str] = []
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
        if not isinstance(payload, dict) or "error" in payload:
            raise _protocol_error("The provider stream contained an invalid event.")

        outputs: list[ModelOutput] = []
        if "usage" in payload and payload["usage"] is not None:
            if self._usage is not None:
                raise _protocol_error("The provider reported usage more than once.")
            self._usage = _parse_usage(payload["usage"])

        choices = payload.get("choices")
        if not isinstance(choices, list):
            raise _protocol_error("The provider stream event has invalid choices.")
        if not choices:
            if "usage" not in payload or payload["usage"] is None:
                raise _protocol_error("The provider stream event is empty.")
            return ()
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
        if content is not None:
            if not isinstance(content, str):
                raise _protocol_error("The provider text delta is invalid.")
            if content:
                self._text_parts.append(content)
                outputs.append(TextDelta(content))
        if "tool_calls" in delta:
            self._append_tool_calls(delta["tool_calls"])

        finish_reason = choice.get("finish_reason")
        if finish_reason is not None:
            try:
                self._finish_reason = ModelFinishReason(finish_reason)
            except (TypeError, ValueError) as error:
                raise _protocol_error(
                    "The provider returned an unsupported finish_reason."
                ) from error
        return tuple(outputs)

    def end(self) -> tuple[ModelOutput, ...]:
        if self._complete:
            return ()
        return self._finish()

    def _append_tool_calls(self, value: Any) -> None:
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
            call = self._tool_calls.setdefault(index, _PartialToolCall())
            call_id = item.get("id")
            if call_id is not None:
                if not isinstance(call_id, str):
                    raise _protocol_error("The provider tool-call ID is invalid.")
                call.call_id_parts.append(call_id)
            call_type = item.get("type")
            if call_type is not None and call_type != "function":
                raise _protocol_error("The provider tool-call type is invalid.")
            function = item.get("function")
            if function is None:
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

    def _finish(self) -> tuple[ModelOutput, ...]:
        reason = self._finish_reason
        if reason is None:
            raise _protocol_error("The provider stream ended without finish_reason.")
        outputs: list[ModelOutput] = []
        has_text = bool("".join(self._text_parts).strip())
        if reason is ModelFinishReason.STOP:
            if not has_text or self._tool_calls:
                raise _protocol_error(
                    "The provider returned content inconsistent with stop."
                )
        elif reason is ModelFinishReason.TOOL_CALLS:
            outputs.extend(self._assemble_tool_calls())
        outputs.append(self._usage or TokenUsage())
        outputs.append(ModelFinish(reason))
        self._complete = True
        return tuple(outputs)

    def _assemble_tool_calls(self) -> tuple[ModelToolCall, ...]:
        if not self._tool_calls:
            raise _protocol_error(
                "The provider ended with tool_calls but returned no calls."
            )
        indexes = sorted(self._tool_calls)
        if indexes != list(range(len(indexes))):
            raise _protocol_error("The provider tool-call indexes are incomplete.")
        calls: list[ModelToolCall] = []
        call_ids: set[str] = set()
        for index in indexes:
            partial = self._tool_calls[index]
            call_id = "".join(partial.call_id_parts)
            name = "".join(partial.name_parts)
            raw_arguments = "".join(partial.argument_parts)
            if (
                not call_id.strip()
                or len(call_id) > MAX_TOOL_IDENTIFIER_LENGTH
                or not name.strip()
                or len(name) > MAX_TOOL_IDENTIFIER_LENGTH
            ):
                raise _protocol_error("The provider returned an incomplete tool call.")
            if call_id in call_ids:
                raise _protocol_error("The provider returned duplicate tool-call IDs.")
            if len(raw_arguments.encode("utf-8")) > MAX_TOOL_ARGUMENT_BYTES:
                raise _protocol_error("The provider tool arguments were too large.")
            try:
                arguments = json.loads(raw_arguments)
            except ValueError as error:
                raise _protocol_error(
                    "The provider returned invalid tool arguments."
                ) from error
            if not isinstance(arguments, dict):
                raise _protocol_error(
                    "The provider tool arguments must be a JSON object."
                )
            call_ids.add(call_id)
            calls.append(ModelToolCall(call_id, name, arguments))
        return tuple(calls)


def _parse_usage(value: Any) -> TokenUsage:
    if not isinstance(value, dict):
        raise _protocol_error("The provider usage record is invalid.")
    return TokenUsage(
        input_tokens=_optional_token_count(value.get("prompt_tokens")),
        output_tokens=_optional_token_count(value.get("completion_tokens")),
        total_tokens=_optional_token_count(value.get("total_tokens")),
    )


def _optional_token_count(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise _protocol_error("The provider usage record is invalid.")
    return value


def _protocol_error(message: str) -> ModelAdapterError:
    return ModelAdapterError(ModelErrorCode.PROVIDER_PROTOCOL, message)
