"""MCP tools use the existing schema validation, policy and execution pipeline."""

import json
from collections.abc import Mapping

from jsonschema import Draft202012Validator
from mcp_types import CallToolResult
from referencing import Registry

from kunyu.agent.mcp.results import project_result
from kunyu.agent.runtime.tools import (
    ToolApproval,
    ToolCall,
    ToolExecutionError,
    ToolRiskLevel,
    ToolSpec,
    ToolValidationError,
)
from kunyu.agent.tools.shared import require_bound_call
from kunyu.integrations.mcp.connection import request_error


class McpTool:
    def __init__(
        self,
        run_id: str,
        connection,
        definition: dict,
        catalog_revision: int,
        contexts,
        attachments,
    ) -> None:
        self.run_id, self.connection = run_id, connection
        self.definition = json.loads(json.dumps(definition, allow_nan=False))
        self.catalog_revision = catalog_revision
        self.contexts, self.attachments = contexts, attachments
        read_only = definition["name"] in connection.config.read_only_tools
        self.spec = ToolSpec(
            name=definition["public_name"],
            description=definition.get("description", ""),
            parameters=self.definition["inputSchema"],
            risk_level=ToolRiskLevel.L0 if read_only else ToolRiskLevel.L2,
            execution="parallel" if read_only else "exclusive",
            presentation="context" if read_only else "write",
            timeout_ms=connection.config.tool_timeout_ms,
            timeout_error_code="MCP_TIMEOUT",
            approval=None
            if read_only
            else ToolApproval(
                execution="tool",
                summary=f"调用 MCP 服务 {connection.config.name} 的 {definition['name']} 工具",
                side_effect=f"目标：{connection.config.url if connection.config.transport == 'streamable-http' else connection.config.command}。此工具由外部服务执行，可能修改数据或启动任务。",
                binding=f"mcp:{connection.config.name}:{connection.revision}:{catalog_revision}:{definition['name']}",
            ),
        )
        self.validator = Draft202012Validator(
            self.definition["inputSchema"], registry=Registry()
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        if not isinstance(arguments, Mapping):
            raise ToolValidationError("MCP arguments must be an object.")
        value = dict(arguments)
        json.dumps(value, allow_nan=False)
        if not self.validator.is_valid(value):
            raise ToolValidationError(
                "MCP arguments do not match the advertised schema."
            )
        execution = self.definition.get("execution")
        if execution is not None and execution.get("taskSupport") == "required":
            raise ToolValidationError(
                "This MCP tool requires task execution, which is not enabled."
            )
        return value

    async def execute(self, call: ToolCall):
        require_bound_call(call, self.run_id, self.spec.name)
        if self.connection.catalog_revision != self.catalog_revision:
            raise ToolExecutionError(
                "MCP tool catalog changed; request a new tool call.",
                code="MCP_TOOL_CHANGED",
            )
        try:
            client = self.connection.require_client()
            # Low-level SDK calls do not re-send tools or answer elicitation implicitly.
            result = await client.session.call_tool(
                self.definition["name"], dict(call.arguments)
            )
        except Exception as error:
            raise request_error(error) from None
        if not isinstance(result, CallToolResult):
            raise ToolExecutionError(
                "MCP returned an unsupported tool result.", code="MCP_RESULT_INVALID"
            )
        value = result.model_dump(mode="json", by_alias=True, exclude_none=True)
        if result.is_error:
            text = "\n".join(
                block["text"]
                for block in value["content"]
                if block.get("type") == "text"
            )
            raise ToolExecutionError(
                f"MCP tool reported an error:\n{text[:1600]}", code="MCP_TOOL_ERROR"
            )
        return await project_result(value, call, self.contexts, self.attachments)
