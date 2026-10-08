"""Workspace memory read/write tools and the confirmed local write handler."""

from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Annotated

from pydantic import Field, JsonValue, StringConstraints
from sqlalchemy.orm import Session

from kunyu.agent.runtime.tools import (
    ToolApproval,
    ToolCall,
    ToolConfirmationRequiredError,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.shared import (
    MAX_TOOL_RESULT_BYTES,
    ToolArguments,
    encode_json,
    load_source,
    require_bound_call,
    tool_result,
    validate_arguments,
    validate_model,
)
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.workspace_memory import (
    WorkspaceMemory,
    WorkspaceMemoryPage,
    WorkspaceMemoryRepository,
)
from kunyu.persistence.workspace_memory import add_workspace_memory


class _MemoryReadArguments(ToolArguments):
    query: Annotated[
        str,
        StringConstraints(strip_whitespace=True, max_length=200),
    ] = ""
    limit: Annotated[int, Field(ge=1, le=20)] = 20


class _MemoryWriteArguments(ToolArguments):
    content: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000),
    ]


class MemoryReadTool:
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        memories: WorkspaceMemoryRepository,
    ) -> None:
        self._run_id = run_id
        self._contexts = contexts
        self._memories = memories
        self._spec = ToolSpec(
            name="memory_read",
            description=(
                "Search confirmed memories in the current server-bound workspace "
                "using a literal substring."
            ),
            parameters=_MemoryReadArguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="search",
        )

    @property
    def spec(self) -> ToolSpec:
        return self._spec

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, _MemoryReadArguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        arguments = validate_model(self.spec.name, _MemoryReadArguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        page = self._memories.read(
            source.workspace.id,
            arguments.query,
            arguments.limit,
        )
        return _memory_read_result(page, arguments.query)


MEMORY_WRITE_APPROVAL = ToolApproval(
    execution="transaction",
    summary="Save this exact memory to the current workspace.",
    side_effect="Creates one persistent workspace memory visible to future agent runs in this workspace.",
)


class MemoryWriteTool:
    def __init__(self, run_id: str, contexts: RunContextRepository) -> None:
        self._run_id = run_id
        self._contexts = contexts
        self._spec = ToolSpec(
            name="memory_write",
            description=(
                "Propose a workspace preference or concern for exact user "
                "confirmation before it is saved."
            ),
            parameters=_MemoryWriteArguments.model_json_schema(),
            risk_level=ToolRiskLevel.L2,
            approval=MEMORY_WRITE_APPROVAL,
            execution="exclusive",
            presentation="write",
        )

    @property
    def spec(self) -> ToolSpec:
        return self._spec

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, _MemoryWriteArguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        self.validate(call.arguments)
        load_source(self._contexts, self._run_id)
        raise ToolConfirmationRequiredError(
            "memory_write requires an approved durable confirmation."
        )


def _memory_read_result(page: WorkspaceMemoryPage, query: str) -> ToolResult:
    items: list[dict[str, str]] = []
    for memory in page.items:
        candidate = [
            *items,
            {
                "id": memory.id,
                "content": memory.content,
                "created_at": memory.created_at.isoformat(),
            },
        ]
        payload = _memory_payload(candidate, page.total_count, query)
        if len(encode_json(payload)) > MAX_TOOL_RESULT_BYTES:
            break
        items = candidate
    return tool_result(_memory_payload(items, page.total_count, query))


def _memory_payload(
    items: list[dict[str, str]], total_count: int, query: str
) -> dict[str, object]:
    return {
        "query": query,
        "items": items,
        "returned_count": len(items),
        "total_count": total_count,
        "truncated": len(items) < total_count,
    }


class MemoryWriteHandler:
    def __init__(self, memory_id_factory: Callable[[], str]) -> None:
        self._memory_id_factory = memory_id_factory

    def execute(
        self,
        database_session: Session,
        workspace_id: str,
        call: ToolCall,
        now: datetime,
    ) -> dict[str, JsonValue]:
        arguments = validate_model(call.name, _MemoryWriteArguments, call.arguments)
        memory = WorkspaceMemory(
            id=self._memory_id_factory(),
            workspace_id=workspace_id,
            content=arguments.content,
            source_tool_call_id=call.call_id,
            created_at=now,
        )
        add_workspace_memory(database_session, memory)
        return {
            "memory": {
                "id": memory.id,
                "workspace_id": memory.workspace_id,
                "content": memory.content,
                "created_at": memory.created_at.isoformat(),
            }
        }
