"""Lossless model-history snapshots shared by primary and auxiliary calls."""

from pydantic import JsonValue, TypeAdapter

from kunyu.agent.runtime.content import ReplayEnvelope
from kunyu.agent.runtime.input_content import InputMessageSource, MessageContentBlock
from kunyu.agent.runtime.models import ModelMessage, ModelRole

CONTENT = TypeAdapter(tuple[MessageContentBlock, ...])


def message_snapshot(message: ModelMessage) -> dict[str, JsonValue]:
    value = {
        "role": message.role.value,
        "content": [block.model_dump(mode="json") for block in message.content],
        "replay_state": None
        if message.replay_state is None
        else message.replay_state.model_dump(mode="json"),
    }
    if message.input_source is not None:
        value["input_source"] = message.input_source.model_dump(mode="json")
    if message.context_source is not None:
        value["source"] = {"kind": "context", "producer": message.context_source}
    if message.source_model is not None:
        value["source"] = {"kind": "model", "model": message.source_model}
    if message.tool_call_id is not None:
        value["tool_call_id"] = message.tool_call_id
    if message.is_error is not None:
        value["is_error"] = message.is_error
    return value


def snapshot_message(value: dict[str, JsonValue]) -> ModelMessage:
    source = value.get("source")
    context_source = source_model = None
    if source is not None:
        if not isinstance(source, dict):
            raise ValueError("Invalid model message source.")
        kind = source.get("kind")
        if kind == "context" and isinstance(source.get("producer"), str):
            context_source = source["producer"]
        elif kind == "model" and isinstance(source.get("model"), str):
            source_model = source["model"]
        else:
            raise ValueError("Invalid model message source identity.")
    return ModelMessage(
        role=ModelRole(value["role"]),
        content=CONTENT.validate_python(value["content"]),
        context_source=context_source,
        source_model=source_model,
        replay_state=ReplayEnvelope.model_validate(value["replay_state"])
        if value.get("replay_state") is not None
        else None,
        input_source=InputMessageSource.model_validate(value["input_source"])
        if value.get("input_source") is not None
        else None,
        tool_call_id=value.get("tool_call_id"),
        is_error=value.get("is_error"),
    )
