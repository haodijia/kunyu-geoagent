"""Run-bound task list updates; the runner commits snapshot and result together."""

from collections.abc import Mapping
from datetime import UTC, datetime

from kunyu.agent.runtime.events import TodoWriteEvent, TodoWritePayload
from kunyu.agent.runtime.todos import TodoList
from kunyu.agent.runtime.tools import ToolCall, ToolResult, ToolRiskLevel, ToolSpec
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    tool_result,
    validate_arguments,
    validate_model,
)
from kunyu.domain.agent_context import RunContextRepository


class TodoArguments(ToolArguments):
    todos: TodoList


class TodoWriteTool:
    def __init__(self, run_id: str, contexts: RunContextRepository) -> None:
        self._run_id, self._contexts = run_id, contexts
        self._spec = ToolSpec(
            name="todo_write",
            description=(
                "Record and update the structured task list for current work. Send the ENTIRE "
                "list every call; it REPLACES the previous list. Add one todo per concrete "
                "step before multi-step work. Keep at most one task in_progress; while work "
                "remains, exactly one should be active. Mark tasks completed immediately. "
                "Skip the list for trivial single-step tasks. Statuses: pending, in_progress, completed."
            ),
            parameters=TodoArguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="exclusive",
            presentation="context",
        )

    @property
    def spec(self) -> ToolSpec:
        return self._spec

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, TodoArguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        arguments = validate_model(self.spec.name, TodoArguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        todos = [item.model_dump(mode="json") for item in arguments.todos]
        result = tool_result(
            {
                "todos": todos,
                "counts": {
                    "pending": sum(
                        item.status == "pending" for item in arguments.todos
                    ),
                    "inProgress": sum(
                        item.status == "in_progress" for item in arguments.todos
                    ),
                    "completed": sum(
                        item.status == "completed" for item in arguments.todos
                    ),
                },
            }
        )
        return ToolResult(
            content=result.content,
            events=(
                TodoWriteEvent(
                    session_id=source.session.id,
                    run_id=self._run_id,
                    event_type="todo/write",
                    payload=TodoWritePayload(
                        tool_call_id=call.call_id, todos=arguments.todos
                    ),
                    occurred_at=datetime.now(UTC),
                ),
            ),
        )
