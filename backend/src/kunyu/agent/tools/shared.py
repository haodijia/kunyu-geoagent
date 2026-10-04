"""Shared tool argument, ownership and result validation."""

import json
from collections.abc import Mapping

from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter, ValidationError

from kunyu.agent.context import RunContextIntegrityError, validate_run_context_source
from kunyu.agent.runtime.content import TextBlock
from kunyu.agent.runtime.tools import (
    ToolCall,
    ToolExecutionError,
    ToolResult,
    ToolValidationError,
)
from kunyu.domain.agent_context import RunContextRepository, RunContextSource

MAX_TOOL_RESULT_BYTES = 16 * 1024


class ToolArguments(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


def validate_arguments[ArgumentsT: ToolArguments](
    tool_name: str,
    model: type[ArgumentsT],
    arguments: object,
) -> Mapping[str, object]:
    return validate_model(tool_name, model, arguments).model_dump(mode="python")


def validate_model[ArgumentsT: ToolArguments](
    tool_name: str,
    model: type[ArgumentsT],
    arguments: object,
) -> ArgumentsT:
    try:
        return model.model_validate(arguments)
    except ValidationError as error:
        raise ToolValidationError(
            f"Arguments for tool '{tool_name}' do not match its schema."
        ) from error


def require_bound_call(call: ToolCall, run_id: str, tool_name: str) -> None:
    if call.run_id != run_id or call.name != tool_name:
        raise ToolExecutionError(
            "Tool call ownership does not match its server-bound registry."
        )


def load_source(contexts: RunContextRepository, run_id: str) -> RunContextSource:
    source = contexts.get(run_id)
    if source is None:
        raise ToolExecutionError("The tool call references an unknown run.")
    try:
        validate_run_context_source(source, run_id)
    except RunContextIntegrityError as error:
        raise ToolExecutionError("The tool call scope is inconsistent.") from error
    return source


def tool_result(value: object) -> ToolResult:
    encoded = encode_json(value)
    if len(encoded) > MAX_TOOL_RESULT_BYTES:
        raise ToolExecutionError("Tool result exceeds the 16 KiB result limit.")
    return ToolResult(
        content=(TextBlock(text=encoded.decode("utf-8")),),
        result=TypeAdapter(JsonValue).validate_python(value),
    )


def encode_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
