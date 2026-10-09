"""Translate the SDK's shared stream events once for every provider."""

from pydantic_ai import messages as sdk

from kunyu.agent.runtime.models import (
    BlockEnd,
    BlockStart,
    ModelToolCallDelta,
    ReasoningDelta,
    TextDelta,
)
from kunyu.integrations.model.sdk_content import canonical_part
from kunyu.integrations.model.sdk_observation import protocol_error

MAX_TOOL_CALLS = 16
MAX_TOOL_ARGUMENT_BYTES = 16 * 1024


class SDKEventMapper:
    def __init__(self, *, defer_close: bool) -> None:
        self.parts = {}
        self.closed = set()
        self.sdk_closed = set()
        self.defer_close = defer_close

    def push(self, event):
        if isinstance(event, sdk.FinalResultEvent):
            return []
        index = event.index
        if isinstance(event, sdk.PartStartEvent):
            if index in self.parts:
                raise protocol_error("The SDK reopened a response part.")
            block = canonical_part(event.part, pending=True)
            self.parts[index] = event.part
            result = [BlockStart(index, block.type)]
            if isinstance(event.part, sdk.TextPart) and event.part.content:
                result.append(TextDelta(index, event.part.content))
            elif isinstance(event.part, sdk.ThinkingPart) and event.part.content:
                result.append(ReasoningDelta(index, event.part.content))
            elif isinstance(event.part, sdk.ToolCallPart):
                result.append(
                    ModelToolCallDelta(
                        index,
                        event.part.tool_call_id,
                        event.part.tool_name,
                        block.arguments,
                    )
                )
            self._limits()
            return result
        if index not in self.parts or index in self.sdk_closed:
            raise protocol_error("The SDK event does not identify an open part.")
        if isinstance(event, sdk.PartDeltaEvent):
            self.parts[index] = event.delta.apply(self.parts[index])
            self._limits()
            if isinstance(event.delta, sdk.TextPartDelta):
                return [TextDelta(index, event.delta.content_delta)]
            if isinstance(event.delta, sdk.ThinkingPartDelta):
                return (
                    [ReasoningDelta(index, event.delta.content_delta)]
                    if event.delta.content_delta
                    else []
                )
            if isinstance(event.delta, sdk.ToolCallPartDelta):
                delta = event.delta.args_delta
                if isinstance(delta, dict):
                    raise protocol_error(
                        "The SDK changed structured tool arguments after their start."
                    )
                part = self.parts[index]
                return [
                    ModelToolCallDelta(
                        index,
                        part.tool_call_id,
                        part.tool_name,
                        delta if delta is not None else "",
                    )
                ]
            raise protocol_error("Unsupported SDK response delta.")
        if isinstance(event, sdk.PartEndEvent):
            self.parts[index] = event.part
            self._limits()
            self.sdk_closed.add(index)
            if isinstance(event.part, sdk.ToolCallPart) and event.part.args is None:
                return []
            self.closed.add(index)
            return (
                []
                if self.defer_close
                else [BlockEnd(index, canonical_part(event.part))]
            )
        raise protocol_error("Unsupported SDK stream event.")

    def finalize(self, response):
        if len(self.parts) > len(response.parts):
            raise protocol_error("The SDK final response dropped an observed part.")
        outputs = []
        for index, part in enumerate(response.parts):
            block = canonical_part(part)
            if index not in self.parts:
                outputs.append(BlockStart(index, block.type))
            elif canonical_part(self.parts[index], pending=True).type != block.type:
                raise protocol_error(
                    "The SDK final response changed an observed part type."
                )
            if self.defer_close or index not in self.closed:
                outputs.append(BlockEnd(index, block))
            elif canonical_part(self.parts[index]) != block:
                raise protocol_error(
                    "The SDK final response disagrees with a closed part."
                )
            self.parts[index] = part
        self._limits()
        return outputs

    def _limits(self):
        tools = [
            part for part in self.parts.values() if isinstance(part, sdk.ToolCallPart)
        ]
        if len(tools) > MAX_TOOL_CALLS:
            raise protocol_error("The SDK returned too many tool calls.")
        for part in tools:
            arguments = canonical_part(part, pending=True).arguments
            if len(arguments.encode()) > MAX_TOOL_ARGUMENT_BYTES:
                raise protocol_error("The SDK tool argument limit was exceeded.")
