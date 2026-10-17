"""Observe SDK-native facts without encoding requests or parsing protocol streams."""

import json

from pydantic import BaseModel

from kunyu.agent.runtime.contracts.models import (
    ModelAdapterError,
    ModelErrorCode,
    TokenUsage,
)


def protocol_error(message: str) -> ModelAdapterError:
    return ModelAdapterError(ModelErrorCode.PROVIDER_PROTOCOL, message)


class SDKObservation:
    def __init__(self) -> None:
        self.counts: dict[str, int] = {}
        self.native_tool_ids: set[str] = set()
        self.native_tool_inputs: dict[str, dict] = {}
        self.terminal = False
        self.terminal_response = None

    def observe(self, event: BaseModel) -> None:
        data = event.model_dump(exclude_unset=True, warnings="error")
        if (
            len(json.dumps(data, ensure_ascii=False, allow_nan=False).encode())
            > 2 * 1024 * 1024
        ):
            raise protocol_error("The SDK event exceeds the response limit.")
        usage = data.get("usage")
        if data.get("type") == "message_start":
            usage = data["message"].get("usage")
        if isinstance(data.get("response"), dict):
            usage = data["response"].get("usage")
            self.terminal |= data.get("type") in {
                "response.completed",
                "response.incomplete",
            }
            if data.get("type") in {"response.completed", "response.incomplete"}:
                self.terminal_response = event.response
        if usage is not None:
            self._usage(usage)
        for choice in data.get("choices", []):
            self.terminal |= choice.get("finish_reason") is not None
            delta = choice.get("delta", {})
            for key in ("content", "reasoning", "reasoning_content"):
                if delta.get(key) is not None and not isinstance(delta[key], str):
                    raise protocol_error(
                        "The provider returned an invalid SDK text field."
                    )
            for call in delta.get("tool_calls") or []:
                if call.get("id") is not None:
                    self._tool_id(call["id"])
                function = call.get("function")
                if function is not None:
                    for key in ("name", "arguments"):
                        if function.get(key) is not None and not isinstance(
                            function[key], str
                        ):
                            raise protocol_error(
                                "The provider returned an invalid SDK tool field."
                            )
        self.terminal |= data.get("type") == "message_stop"
        block = data.get("content_block")
        if isinstance(block, dict) and block.get("type") == "tool_use":
            self._tool_id(block.get("id"))
            if "input" in block:
                if not isinstance(block["input"], dict):
                    raise protocol_error("The native SDK tool input is not an object.")
                self.native_tool_inputs[block["id"]] = block["input"]
        item = data.get("item")
        if isinstance(item, dict) and item.get("type") == "function_call":
            self._tool_id(item.get("call_id"))

    def _tool_id(self, value: object) -> None:
        if not isinstance(value, str) or not value.strip() or len(value) > 256:
            raise protocol_error("The provider tool-call identity is invalid.")
        self.native_tool_ids.add(value)
        if len(self.native_tool_ids) > 16:
            raise protocol_error("The SDK tool-call limit was exceeded.")

    def _usage(self, value: object) -> None:
        if not isinstance(value, dict):
            raise protocol_error("The SDK usage record is invalid.")
        for key, target in (
            ("prompt_tokens", "input_tokens"),
            ("input_tokens", "input_tokens"),
            ("completion_tokens", "output_tokens"),
            ("output_tokens", "output_tokens"),
            ("total_tokens", "total_tokens"),
            ("cache_read_input_tokens", "cache_read_input_tokens"),
            ("cache_creation_input_tokens", "cache_creation_input_tokens"),
            ("prompt_cache_hit_tokens", "cache_read_input_tokens"),
        ):
            if key in value and value[key] is not None:
                self._count(target, value[key])
        for key in ("prompt_tokens_details", "input_tokens_details"):
            details = value.get(key)
            if details is not None:
                if not isinstance(details, dict):
                    raise protocol_error("The SDK cache usage record is invalid.")
                for field, target in (
                    ("cached_tokens", "cache_read_input_tokens"),
                    ("cache_write_tokens", "cache_creation_input_tokens"),
                ):
                    if field in details and details[field] is not None:
                        self._count(target, details[field])

    def _count(self, name: str, value: object) -> None:
        if type(value) is not int or value < 0:
            raise protocol_error("The SDK token count is invalid.")
        self.counts[name] = value

    def usage(self) -> TokenUsage | None:
        return TokenUsage(**self.counts) if self.counts else None


class ObservedSDKStream:
    def __init__(self, stream, observation: SDKObservation) -> None:
        self.stream, self.observation = stream, observation
        self.response = stream.response

    def __aiter__(self):
        return self._events()

    async def _events(self):
        async for event in self.stream:
            self.observation.observe(event)
            yield event

    async def close(self) -> None:
        await self.stream.close()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()
