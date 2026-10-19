"""Normalize tool arguments before persisting the executable call snapshot."""

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from pydantic import JsonValue, TypeAdapter, ValidationError

from kunyu.agent.runtime.contracts.content import (
    ToolCallBlock,
)
from kunyu.agent.runtime.contracts.tools import ToolRegistry, ToolValidationError

_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])
logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class PlannedToolCall:
    tool_call_id: str
    provider_call_id: str
    name: str
    arguments: dict[str, JsonValue]
    execution: Literal["parallel", "exclusive"]
    presentation: Literal["context", "search", "write"]


class ModelOutputError(RuntimeError):
    pass


def plan_tool_batch(
    registry: ToolRegistry,
    calls: tuple[ToolCallBlock, ...],
    *,
    tool_call_id_factory: Callable[[], str],
) -> tuple[PlannedToolCall, ...]:
    validated: list[PlannedToolCall] = []
    identities: set[str] = set()
    for call in calls:
        if call.id in identities:
            raise ModelOutputError("Duplicate provider tool-call ID.")
        identities.add(call.id)
        tool = registry.get(call.name)
        try:
            arguments = _JSON_OBJECT_ADAPTER.validate_python(
                json.loads(call.arguments, parse_constant=_reject_json_constant)
            )
        except (ValueError, TypeError) as error:
            raise ModelOutputError("Tool arguments must be a JSON object.") from error
        if tool is not None:
            try:
                arguments = _JSON_OBJECT_ADAPTER.validate_python(
                    dict(tool.validate(arguments))
                )
            except (ToolValidationError, ValidationError) as error:
                # Invalid calls still receive a normal tool error for model correction.
                logger.warning(
                    "Tool %s arguments could not be normalized: %s", call.name, error
                )
        tool_call_id = tool_call_id_factory()
        validated.append(
            PlannedToolCall(
                tool_call_id=tool_call_id,
                provider_call_id=call.id,
                name=call.name,
                arguments=arguments,
                execution="exclusive" if tool is None else tool.spec.execution,
                presentation="context" if tool is None else tool.spec.presentation,
            )
        )
    return tuple(validated)


def _reject_json_constant(value: str) -> None:
    raise ValueError(f"Non-finite JSON constant: {value}")
