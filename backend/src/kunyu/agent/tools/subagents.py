"""Model-facing one-shot delegation, collection and cancellation."""

from collections.abc import Mapping
from typing import Literal

from pydantic import Field, model_validator

from kunyu.agent.runtime.subagents import ReducedSubagent
from kunyu.agent.runtime.tools import (
    ToolCall,
    ToolExecutionError,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.subagents import SubagentManager
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    tool_result,
    validate_arguments,
    validate_model,
)


class DelegateArguments(ToolArguments):
    description: str = Field(min_length=1, max_length=200)
    prompt: str = Field(min_length=1, max_length=32_768)
    run_in_background: bool = False

    @model_validator(mode="after")
    def nonempty(self):
        if not self.description.strip() or not self.prompt.strip():
            raise ValueError("Delegation needs a description and prompt.")
        return self


class WaitArguments(ToolArguments):
    child_ids: list[str] = Field(min_length=1, max_length=4)
    timeout_seconds: int = Field(ge=0, le=30, default=30)

    @model_validator(mode="after")
    def unique(self):
        if len(set(self.child_ids)) != len(self.child_ids):
            raise ValueError("Child identities must be unique.")
        return self


class CancelArguments(ToolArguments):
    child_id: str = Field(min_length=1, max_length=64)


class ResultArguments(CancelArguments):
    offset: int = Field(ge=0, default=0)
    limit: int = Field(ge=1, le=2048, default=2048)


def result_snapshot(child: ReducedSubagent, manager: SubagentManager) -> dict:
    output = "" if child.settled is None else child.settled.output
    # The full report is persisted; every result explicitly identifies clipping.
    encoded = output.encode("utf-8")
    prefix = encoded[:2_048].decode("utf-8", errors="ignore")
    state = manager.repository.child_state(child.created.child_session_id)
    run = next(
        (run for run in state.runs if run.run_id == child.created.child_run_id), None
    )
    return {
        "child_id": child.created.child_session_id,
        "description": child.created.description,
        "status": child.settled.status
        if child.settled is not None
        else "queued"
        if run is None
        else run.state.value,
        "output": prefix,
        "output_truncated": len(encoded) > 2_048,
        "reason": None if child.settled is None else child.settled.reason,
    }


class SubagentTool:
    def __init__(
        self,
        run_id: str,
        manager: SubagentManager,
        name: Literal[
            "subagent", "wait_subagents", "cancel_subagent", "subagent_result"
        ],
    ):
        self.run_id, self.manager, self.name = run_id, manager, name
        models = {
            "subagent": DelegateArguments,
            "wait_subagents": WaitArguments,
            "cancel_subagent": CancelArguments,
            "subagent_result": ResultArguments,
        }
        descriptions = {
            "subagent": "Delegate an independent read-only task to a subagent. Supply all relevant context in prompt; the child does not inherit conversation history or attachments. It uses the exact current model configuration and cannot delegate, modify data or ask the user. Waits for completion by default; set run_in_background=true to return its child_id and collect with wait_subagents. Parent stopping cancels unfinished children. Results include at most 2048 UTF-8 bytes of the final report, with explicit clipping; full reports remain in the child journal.",
            "wait_subagents": "Wait for up to four children owned by this parent run. Return their outcomes or current status when timeout_seconds expires; timeout does not cancel them. Full reports remain in each child journal.",
            "cancel_subagent": "Cancel a child owned by this parent run, drain its active execution, and return the persisted outcome.",
            "subagent_result": "Read a completed child's full report in pages. Supply child_id owned by this parent run, a zero-based Unicode character offset and a limit up to 2048. Use next_offset until it is null. Refuses children without a persisted outcome.",
        }
        self.arguments = models[name]
        self._spec = ToolSpec(
            name=name,
            description=descriptions[name],
            parameters=self.arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="context",
            timeout_ms=300_000 if name == "subagent" else 35_000,
        )

    @property
    def spec(self):
        return self._spec

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.name, self.arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self.run_id, self.name)
        args = validate_model(self.name, self.arguments, call.arguments)
        source = load_source(self.manager.contexts, self.run_id)
        parent_id = source.session.id
        if self.name == "subagent":
            child_id = await self.manager.start(call)
            if args.run_in_background:
                children = (self.manager.require(child_id, parent_id, self.run_id),)
            else:
                children = await self.manager.wait(
                    parent_id, (child_id,), owner_run_id=self.run_id, timeout=None
                )
        elif self.name == "wait_subagents":
            children = await self.manager.wait(
                parent_id,
                tuple(args.child_ids),
                owner_run_id=self.run_id,
                timeout=args.timeout_seconds,
            )
        elif self.name == "subagent_result":
            child = self.manager.require(args.child_id, parent_id, self.run_id)
            if child.settled is None:
                raise ToolExecutionError(
                    "Wait for the child outcome before reading its report."
                )
            output = child.settled.output
            if args.offset > len(output):
                raise ToolExecutionError(
                    "The requested report offset exceeds its length."
                )
            end = min(len(output), args.offset + args.limit)
            return tool_result(
                {
                    "child_id": args.child_id,
                    "status": child.settled.status,
                    "output": output[args.offset : end],
                    "offset": args.offset,
                    "total_characters": len(output),
                    "next_offset": end if end < len(output) else None,
                }
            )
        else:
            children = (
                await self.manager.cancel(args.child_id, parent_id, self.run_id),
            )
        return tool_result(
            {"children": [result_snapshot(child, self.manager) for child in children]}
        )
