"""Harness-style named MCP resource tools, sharing the normal Agent tool loop."""

import json
from functools import partial

from pydantic import Field

from kunyu.agent.mcp.results import project_result
from kunyu.agent.runtime.content import TextBlock
from kunyu.agent.runtime.tools import (
    ToolCall,
    ToolExecutionError,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.agent.tools.shared import (
    ToolArguments,
    require_bound_call,
    validate_arguments,
)
from kunyu.integrations.mcp.connection import request_error


class ResourceListArguments(ToolArguments):
    server: str = Field(pattern=r"^[A-Za-z0-9_-]{1,32}$")
    cursor: str | None = Field(default=None, max_length=4096)


class ResourceReadArguments(ToolArguments):
    server: str = Field(pattern=r"^[A-Za-z0-9_-]{1,32}$")
    uri: str = Field(min_length=1, max_length=8192)


class McpResourceTool:
    def __init__(self, run_id: str, manager, operation: str) -> None:
        self.run_id, self.manager, self.operation = run_id, manager, operation
        self.arguments = (
            ResourceReadArguments
            if operation == "read_mcp_resource"
            else ResourceListArguments
        )
        self.spec = ToolSpec(
            name=operation,
            description={
                "list_mcp_resources": "List resources on the named configured MCP server. Pass its returned cursor to continue.",
                "list_mcp_resource_templates": "List parameterized resource URI templates on the named configured MCP server.",
                "read_mcp_resource": "Read a listed resource URI or an expanded resource template from the named MCP server.",
            }[operation],
            parameters=self.arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="context",
            timeout_ms=60_000,
            timeout_error_code="MCP_TIMEOUT",
        )

    def validate(self, arguments):
        return validate_arguments(self.spec.name, self.arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self.run_id, self.spec.name)
        connection = self.manager.connections.get(call.arguments["server"])
        if connection is None:
            raise ToolExecutionError(
                "MCP server is not connected.", code="MCP_CONNECTION_UNAVAILABLE"
            )
        try:
            client = connection.require_client()
            if client.server_capabilities.resources is None:
                raise ToolExecutionError(
                    "MCP server does not declare resource support.",
                    code="MCP_UNSUPPORTED_CAPABILITY",
                )
            if self.operation == "read_mcp_resource":
                result = await client.session.read_resource(call.arguments["uri"])
            elif self.operation == "list_mcp_resources":
                result = await client.list_resources(
                    cursor=call.arguments["cursor"], cache_mode="refresh"
                )
            else:
                result = await client.list_resource_templates(
                    cursor=call.arguments["cursor"], cache_mode="refresh"
                )
        except ToolExecutionError:
            raise
        except Exception as error:
            raise request_error(error) from None
        value = result.model_dump(mode="json", by_alias=True, exclude_none=True)
        if self.operation == "read_mcp_resource":
            return await project_result(
                value,
                call,
                self.manager.contexts,
                self.manager.attachments,
                resource=True,
            )
        return ToolResult(
            content=(
                TextBlock(
                    text=json.dumps(
                        {"server": call.arguments["server"], **value},
                        ensure_ascii=False,
                    )
                ),
            ),
            result=value,
        )


def register_resources(context, registry, manager) -> None:
    for name in (
        "list_mcp_resources",
        "list_mcp_resource_templates",
        "read_mcp_resource",
    ):
        registry.register(
            context,
            name,
            ToolRegistration(partial(McpResourceTool, manager=manager, operation=name)),
        )
