import json
from collections.abc import Mapping
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

from dsh.tools import (
    PolicyDecision,
    ToolCall,
    ToolConfirmationRequiredError,
    ToolExecutionError,
    ToolRegistry,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
    ToolValidationError,
)
from kunyu.application.agent_context import (
    CONTEXT_MEMORY_LIMIT,
    RunContextIntegrityError,
    validate_run_context_source,
)
from kunyu.domain.agent_context import RunContextRepository, RunContextSource
from kunyu.domain.workspace_memory import (
    WorkspaceMemoryPage,
    WorkspaceMemoryRepository,
)

MAX_TOOL_RESULT_BYTES = 16 * 1024


class _ToolArguments(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class _NoArguments(_ToolArguments):
    pass


class _MemorySearchArguments(_ToolArguments):
    query: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
    ]
    limit: Annotated[int, Field(ge=1, le=20)]


class _MemorySaveArguments(_ToolArguments):
    content: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000),
    ]


class WorkspaceGetContextTool:
    def __init__(self, run_id: str, contexts: RunContextRepository) -> None:
        self._run_id = run_id
        self._contexts = contexts
        self._spec = ToolSpec(
            name="workspace_get_context",
            description=(
                "Read the server-bound workspace, session, frozen map context, "
                "and available local capabilities for this run."
            ),
            parameters=_NoArguments.model_json_schema(),
        )

    @property
    def spec(self) -> ToolSpec:
        return self._spec

    def validate(self, arguments: object) -> Mapping[str, object]:
        return _validate_arguments(self.spec.name, _NoArguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        _require_bound_call(call, self._run_id, self.spec.name)
        self.validate(call.arguments)
        source = _load_source(self._contexts, self._run_id)
        return _tool_result(
            {
                "workspace": {
                    "id": source.workspace.id,
                    "name": source.workspace.name,
                },
                "session": {
                    "id": source.session.id,
                    "title": source.session.title,
                },
                "map_context": dict(source.run.map_snapshot),
                "capabilities": {
                    "workspace_context": True,
                    "memory_search": True,
                    "memory_save": {"requires_confirmation": True},
                    "scene_get": False,
                },
            }
        )


class MemorySearchTool:
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
            name="memory_search",
            description=(
                "Search confirmed memories in the current server-bound workspace "
                "using a literal substring."
            ),
            parameters=_MemorySearchArguments.model_json_schema(),
        )

    @property
    def spec(self) -> ToolSpec:
        return self._spec

    def validate(self, arguments: object) -> Mapping[str, object]:
        return _validate_arguments(self.spec.name, _MemorySearchArguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        _require_bound_call(call, self._run_id, self.spec.name)
        arguments = _validate_model(
            self.spec.name, _MemorySearchArguments, call.arguments
        )
        source = _load_source(self._contexts, self._run_id)
        page = self._memories.search(
            source.workspace.id,
            arguments.query,
            arguments.limit,
        )
        return _memory_search_result(page)


class WorkspaceMemorySaveTool:
    def __init__(self, run_id: str, contexts: RunContextRepository) -> None:
        self._run_id = run_id
        self._contexts = contexts
        self._spec = ToolSpec(
            name="workspace_memory_save",
            description=(
                "Propose a workspace preference or concern for exact user "
                "confirmation before it is saved."
            ),
            parameters=_MemorySaveArguments.model_json_schema(),
        )

    @property
    def spec(self) -> ToolSpec:
        return self._spec

    def validate(self, arguments: object) -> Mapping[str, object]:
        return _validate_arguments(self.spec.name, _MemorySaveArguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        _require_bound_call(call, self._run_id, self.spec.name)
        self.validate(call.arguments)
        _load_source(self._contexts, self._run_id)
        raise ToolConfirmationRequiredError(
            "workspace_memory_save requires an approved durable confirmation."
        )


class LocalToolPolicyGate:
    def risk_level(self, call: ToolCall) -> ToolRiskLevel:
        if call.name in {"workspace_get_context", "memory_search"}:
            return ToolRiskLevel.L0
        if call.name == "workspace_memory_save":
            return ToolRiskLevel.L2
        raise ToolExecutionError(f"Tool '{call.name}' is not authorized.")

    def decide(self, call: ToolCall) -> PolicyDecision:
        try:
            risk_level = self.risk_level(call)
        except ToolExecutionError:
            return PolicyDecision.DENY
        if risk_level is ToolRiskLevel.L0:
            return PolicyDecision.ALLOW
        if risk_level is ToolRiskLevel.L2:
            return PolicyDecision.CONFIRM
        raise AssertionError("Unhandled tool risk level.")


class LocalToolRegistryFactory:
    def __init__(
        self,
        contexts: RunContextRepository,
        memories: WorkspaceMemoryRepository,
    ) -> None:
        self._contexts = contexts
        self._memories = memories

    def for_run(self, run_id: str) -> ToolRegistry:
        return ToolRegistry(
            (
                WorkspaceGetContextTool(run_id, self._contexts),
                MemorySearchTool(run_id, self._contexts, self._memories),
                WorkspaceMemorySaveTool(run_id, self._contexts),
            )
        )


def _validate_arguments[ArgumentsT: _ToolArguments](
    tool_name: str,
    model: type[ArgumentsT],
    arguments: object,
) -> Mapping[str, object]:
    return _validate_model(tool_name, model, arguments).model_dump(mode="python")


def _validate_model[ArgumentsT: _ToolArguments](
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


def _require_bound_call(call: ToolCall, run_id: str, tool_name: str) -> None:
    if call.run_id != run_id or call.name != tool_name:
        raise ToolExecutionError(
            "Tool call ownership does not match its server-bound registry."
        )


def _load_source(contexts: RunContextRepository, run_id: str) -> RunContextSource:
    source = contexts.get(run_id, CONTEXT_MEMORY_LIMIT)
    if source is None:
        raise ToolExecutionError("The tool call references an unknown run.")
    try:
        validate_run_context_source(source, run_id)
    except RunContextIntegrityError as error:
        raise ToolExecutionError("The tool call scope is inconsistent.") from error
    return source


def _memory_search_result(page: WorkspaceMemoryPage) -> ToolResult:
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
        payload = _memory_payload(candidate, page.total_count)
        if len(_encode_json(payload)) > MAX_TOOL_RESULT_BYTES:
            break
        items = candidate
    return _tool_result(_memory_payload(items, page.total_count))


def _memory_payload(items: list[dict[str, str]], total_count: int) -> dict[str, object]:
    return {
        "items": items,
        "returned_count": len(items),
        "total_count": total_count,
        "truncated": len(items) < total_count,
    }


def _tool_result(value: object) -> ToolResult:
    encoded = _encode_json(value)
    if len(encoded) > MAX_TOOL_RESULT_BYTES:
        raise ToolExecutionError("Tool result exceeds the 16 KiB result limit.")
    return ToolResult(content=encoded.decode("utf-8"))


def _encode_json(value: object) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
