"""Assemble native Responses SSE items without exposing encrypted reasoning."""

import json
from dataclasses import dataclass, field

from kunyu.agent.runtime.content import (
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
from kunyu.integrations.model.openai_chat_stream import (
    MAX_TOOL_ARGUMENT_BYTES,
    MAX_TOOL_CALLS,
)
from kunyu.integrations.model.openai_responses_items import (
    identifier,
    item_block,
    protocol_error,
)


@dataclass(slots=True)
class _Item:
    value: dict
    parts: dict[tuple[str, int], str] = field(default_factory=dict)
    arguments: str = ""
    done: dict | None = None


class OpenAIResponsesStreamParser:
    def __init__(
        self, model: str, connection_id: str, base_url: str, config_revision: int
    ) -> None:
        self._model, self._connection_id, self._base_url = (
            model,
            connection_id,
            base_url,
        )
        self._id: str | None = None
        self._native_model: str | None = None
        self._items: dict[int, _Item] = {}
        self._sequence = -1
        self._complete = False
        self._config_revision = config_revision

    @property
    def complete(self) -> bool:
        return self._complete

    def end(self) -> tuple[ModelOutput, ...]:
        if not self._complete:
            raise protocol_error(
                "The Responses stream ended without a terminal response."
            )
        return ()

    def push(self, data: str) -> tuple[ModelOutput, ...]:
        if self._complete:
            raise protocol_error("The Responses provider sent data after completion.")
        try:
            event = json.loads(data)
        except ValueError as error:
            raise protocol_error(
                "The Responses stream contained invalid JSON."
            ) from error
        if not isinstance(event, dict) or not isinstance(event.get("type"), str):
            raise protocol_error("The Responses stream contained an invalid event.")
        sequence = event.get("sequence_number")
        if type(sequence) is not int or sequence <= self._sequence:
            raise protocol_error("The Responses stream sequence is invalid.")
        self._sequence = sequence
        kind = event["type"]
        if kind in {"error", "response.failed"}:
            response = event.get("response")
            if kind == "response.failed":
                self._identity(response)
                if response.get("status") != "failed":
                    raise protocol_error("The Responses failed status is invalid.")
            detail = event.get("error") if kind == "error" else response.get("error")
            code = detail.get("code") if isinstance(detail, dict) else event.get("code")
            if code is not None and not isinstance(code, str):
                raise protocol_error("The Responses error code is invalid.")
            if is_context_overflow(detail):
                raise ModelAdapterError(
                    ModelErrorCode.CONTEXT_WINDOW_EXCEEDED,
                    "The provider reported a context window overflow.",
                )
            mapped = {
                "server_error": ModelErrorCode.PROVIDER_SERVER,
                "rate_limit_exceeded": ModelErrorCode.PROVIDER_RATE_LIMIT,
            }.get(code, ModelErrorCode.PROVIDER_PROTOCOL)
            raise ModelAdapterError(
                mapped, "The Responses provider reported a stream failure."
            )
        if kind in {
            "response.created",
            "response.in_progress",
            "response.completed",
            "response.incomplete",
        }:
            response = event.get("response")
            self._identity(response)
            if kind in {"response.completed", "response.incomplete"}:
                return self._finish(response, incomplete=kind == "response.incomplete")
            expected = (
                "queued"
                if kind == "response.created" and response.get("status") == "queued"
                else "in_progress"
            )
            if response.get("status") != expected:
                raise protocol_error("The Responses lifecycle status is invalid.")
            return ()
        if self._id is None:
            raise protocol_error("The Responses stream has no response identity.")
        if kind == "response.output_item.added":
            index = _index(event.get("output_index"))
            value = event.get("item")
            if index != len(self._items) or not isinstance(value, dict):
                raise protocol_error("The Responses output item order is invalid.")
            identity = identifier(value.get("id"))
            if any(item.value["id"] == identity for item in self._items.values()):
                raise protocol_error("The Responses output item IDs are duplicated.")
            native_kind = value.get("type")
            if not isinstance(native_kind, str):
                raise protocol_error("The Responses output item type is invalid.")
            block_kind = {
                "message": "text",
                "reasoning": "reasoning",
                "function_call": "tool-call",
            }.get(native_kind)
            if block_kind is None:
                raise ModelAdapterError(
                    ModelErrorCode.UNSUPPORTED_CAPABILITY,
                    "The Responses provider returned an unsupported output item.",
                )
            item = _Item(value=value.copy())
            outputs: list[ModelOutput] = [BlockStart(index, block_kind)]
            if native_kind == "function_call":
                call_id, name = (
                    identifier(value.get("call_id")),
                    identifier(value.get("name")),
                )
                calls = [
                    existing
                    for existing in self._items.values()
                    if existing.value["type"] == "function_call"
                ]
                if len(calls) >= MAX_TOOL_CALLS or any(
                    existing.value["call_id"] == call_id for existing in calls
                ):
                    raise protocol_error("The Responses tool-call batch is invalid.")
                arguments = value.get("arguments")
                if not isinstance(arguments, str):
                    raise protocol_error(
                        "The Responses function arguments are invalid."
                    )
                item.arguments = arguments
                _arguments_fit(arguments)
                outputs.append(ModelToolCallDelta(index, call_id, name, arguments))
            self._items[index] = item
            return tuple(outputs)
        if kind == "response.output_item.done":
            index = _index(event.get("output_index"))
            item = self._items.get(index)
            value = event.get("item")
            if item is None or item.done is not None or not isinstance(value, dict):
                raise protocol_error("The Responses completed item is invalid.")
            if (
                value.get("id") != item.value["id"]
                or value.get("type") != item.value["type"]
            ):
                raise protocol_error("The Responses output item identity changed.")
            # Only the response terminal decides whether truncated items are usable.
            block = item_block(value, incomplete=True)
            if isinstance(block, ToolCallBlock):
                if (
                    block.id != item.value["call_id"]
                    or block.name != item.value["name"]
                    or not block.arguments.startswith(item.arguments)
                ):
                    raise protocol_error(
                        "The Responses function changed within the stream."
                    )
            else:
                self._validate_parts(item, value)
            item.done = value.copy()
            return (BlockEnd(index, block),)
        item, index = self._event_item(event)
        native_kind = item.value["type"]
        if kind in {
            "response.function_call_arguments.delta",
            "response.function_call_arguments.done",
        }:
            if native_kind != "function_call":
                raise protocol_error(
                    "The Responses function event has the wrong item type."
                )
            if kind.endswith(".done"):
                if event.get("arguments") != item.arguments:
                    raise protocol_error(
                        "The Responses function argument completion disagrees with its deltas."
                    )
                return ()
            delta = _text(event.get("delta"))
            item.arguments += delta
            _arguments_fit(item.arguments)
            return (ModelToolCallDelta(index, item.value["call_id"], None, delta),)
        text_events = {
            "response.output_text": ("message", "content_index", "output_text"),
            "response.refusal": ("message", "content_index", "refusal"),
            "response.reasoning_summary_text": (
                "reasoning",
                "summary_index",
                "summary_text",
            ),
            "response.reasoning_text": ("reasoning", "content_index", "reasoning_text"),
        }
        prefix, _, suffix = kind.rpartition(".")
        if prefix in text_events and suffix in {"delta", "done"}:
            expected_kind, key, part_kind = text_events[prefix]
            if native_kind != expected_kind:
                raise protocol_error(
                    "The Responses text event has the wrong item type."
                )
            part = (part_kind, _index(event.get(key)))
            if suffix == "done":
                if event.get(
                    "refusal" if part_kind == "refusal" else "text"
                ) != item.parts.get(part, ""):
                    raise protocol_error(
                        "The Responses text completion disagrees with its deltas."
                    )
                return ()
            delta = _text(event.get("delta"))
            item.parts[part] = item.parts.get(part, "") + delta
            return (
                (ReasoningDelta if expected_kind == "reasoning" else TextDelta)(
                    index, delta
                ),
            )
        if kind in {
            "response.content_part.added",
            "response.content_part.done",
            "response.reasoning_summary_part.added",
            "response.reasoning_summary_part.done",
            "response.output_text.annotation.added",
        }:
            reasoning = kind.startswith("response.reasoning_summary_part")
            if native_kind != ("reasoning" if reasoning else "message"):
                raise protocol_error(
                    "The Responses part event has the wrong item type."
                )
            _index(event.get("summary_index" if reasoning else "content_index"))
            return ()
        raise protocol_error(
            "The Responses provider returned an unsupported stream event."
        )

    def _identity(self, response: object) -> None:
        if not isinstance(response, dict) or response.get("object") != "response":
            raise protocol_error("The Responses lifecycle record is invalid.")
        identity, model = (
            identifier(response.get("id")),
            identifier(response.get("model")),
        )
        if self._id is None:
            self._id, self._native_model = identity, model
        elif identity != self._id or model != self._native_model:
            raise protocol_error("The Responses identity changed within the stream.")

    def _event_item(self, event: dict) -> tuple[_Item, int]:
        index = _index(event.get("output_index"))
        item = self._items.get(index)
        if (
            item is None
            or item.done is not None
            or event.get("item_id") != item.value["id"]
        ):
            raise protocol_error("The Responses event does not identify an open item.")
        return item, index

    @staticmethod
    def _validate_parts(item: _Item, value: dict) -> None:
        for (kind, index), observed in item.parts.items():
            parts = value.get("summary" if kind == "summary_text" else "content")
            if not isinstance(parts, list) or index >= len(parts):
                raise protocol_error(
                    "The Responses text delta has no completed content part."
                )
            part = parts[index]
            if (
                not isinstance(part, dict)
                or part.get("type") != kind
                or not _text(
                    part.get("refusal" if kind == "refusal" else "text")
                ).startswith(observed)
            ):
                raise protocol_error("The Responses content changed within the stream.")

    def _finish(self, response: dict, *, incomplete: bool) -> tuple[ModelOutput, ...]:
        if response.get("status") != ("incomplete" if incomplete else "completed"):
            raise protocol_error("The Responses terminal status is invalid.")
        output = response.get("output")
        if (
            not isinstance(output, list)
            or output != [item.done for item in self._items.values()]
            or any(item.done is None for item in self._items.values())
        ):
            raise protocol_error(
                "The Responses terminal output disagrees with its completed items."
            )
        reason = ModelFinishReason.STOP
        blocks = [item_block(item, incomplete=incomplete) for item in output]
        if incomplete:
            detail = response.get("incomplete_details")
            native_reason = detail.get("reason") if isinstance(detail, dict) else None
            if not isinstance(native_reason, str):
                raise protocol_error("The Responses incomplete reason is invalid.")
            reason = {
                "max_output_tokens": ModelFinishReason.LENGTH,
                "content_filter": ModelFinishReason.CONTENT_FILTER,
            }.get(native_reason)
            if reason is None:
                raise protocol_error("The Responses incomplete reason is invalid.")
        elif any(isinstance(block, ToolCallBlock) for block in blocks):
            reason = ModelFinishReason.TOOL_CALLS
        elif not any(
            isinstance(block, TextBlock) and block.text.strip() for block in blocks
        ):
            raise ModelAdapterError(
                ModelErrorCode.EMPTY_RESPONSE,
                "The Responses provider returned an empty response.",
            )
        usage = response.get("usage")
        if not isinstance(usage, dict):
            raise protocol_error("The Responses token usage is missing.")
        input_details = usage.get("input_tokens_details")
        if input_details is not None and not isinstance(input_details, dict):
            raise protocol_error("The Responses input token details are invalid.")
        tokens = TokenUsage(
            input_tokens=_tokens(usage.get("input_tokens")),
            output_tokens=_tokens(usage.get("output_tokens")),
            total_tokens=_tokens(usage.get("total_tokens")),
            cache_read_input_tokens=_tokens(input_details.get("cached_tokens"))
            if input_details is not None
            else None,
            cache_creation_input_tokens=_tokens(input_details.get("cache_write_tokens"))
            if input_details is not None
            else None,
        )
        replay = ReplayEnvelope(
            response={
                "kind": "openai-responses",
                "version": 1,
                "model": self._model,
                "connection_id": self._connection_id,
                "config_revision": self._config_revision,
                "base_url": self._base_url,
                "id": self._id,
                "native_model": self._native_model,
                "status": response["status"],
            },
            blocks=tuple(
                {"type": block.type, "item": item}
                for block, item in zip(blocks, output, strict=True)
            ),
        )
        self._complete = True
        return (tokens, ModelFinish(reason, replay))


def _index(value: object) -> int:
    if type(value) is not int or value < 0:
        raise protocol_error("The Responses item or part index is invalid.")
    return value


def _text(value: object) -> str:
    if not isinstance(value, str):
        raise protocol_error("The Responses text delta is invalid.")
    return value


def _tokens(value: object) -> int | None:
    if value is None:
        return None
    if type(value) is not int or value < 0:
        raise protocol_error("The Responses token usage is invalid.")
    return value


def _arguments_fit(value: str) -> None:
    if len(value.encode("utf-8")) > MAX_TOOL_ARGUMENT_BYTES:
        raise protocol_error("The Responses function arguments were too large.")
