"""Exact-snapshot and authorization rules for reviewed tool calls."""

from pydantic import JsonValue, TypeAdapter, ValidationError

from kunyu.agent.runtime.contracts.tools import (
    PolicyDecision,
    ToolExecutionError,
    ToolRegistryError,
    ToolValidationError,
)
from kunyu.agent.runtime.contracts.tools import ToolCall as PolicyToolCall
from kunyu.agent.tools.registry import ToolPolicyGate, ToolRegistryFactory
from kunyu.domain.execution.confirmations import (
    ConfirmationConflictError,
    ConfirmationPolicyError,
)

_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])


def validate_confirmation_snapshot(
    run_id: str,
    tool: PolicyToolCall,
    tool_registries: ToolRegistryFactory,
    policy: ToolPolicyGate,
) -> dict[str, JsonValue]:
    try:
        registered_tool = tool_registries.for_run(run_id).require(tool.name)
        arguments = _JSON_OBJECT_ADAPTER.validate_python(
            dict(registered_tool.validate(tool.arguments))
        )
    except (
        ToolExecutionError,
        ToolRegistryError,
        ToolValidationError,
        ValidationError,
    ) as error:
        raise ConfirmationConflictError(
            "The reviewed tool is unavailable or its arguments changed."
        ) from error
    if arguments != tool.arguments:
        raise ConfirmationConflictError(
            "The stored tool arguments are not the validated snapshot."
        )
    if policy.decide(tool) is not PolicyDecision.CONFIRM:
        raise ConfirmationPolicyError(
            "The tool is not authorized through the confirmation path."
        )
    return arguments
