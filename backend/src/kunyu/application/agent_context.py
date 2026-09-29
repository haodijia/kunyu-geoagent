import json
from dataclasses import dataclass

from dsh.context import AgentContext
from dsh.models import ModelMessage, ModelRole, ModelToolCall
from dsh.run_state import ReducedAssistant, ReducedRun, ReducedToolCall

from kunyu.domain.agent_context import RunContextRepository, RunContextSource

CONTEXT_MEMORY_LIMIT = 20


class RunContextNotFoundError(LookupError):
    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        super().__init__(f"Run '{run_id}' was not found.")


class RunContextIntegrityError(RuntimeError):
    """Committed Agent facts cannot form a safe model-visible history."""


@dataclass(frozen=True, slots=True)
class _HistoryStep:
    sequence: int
    messages: tuple[ModelMessage, ...]


class ScopedAgentContextProvider:
    def __init__(self, repository: RunContextRepository) -> None:
        self._repository = repository

    async def build(self, run_id: str) -> AgentContext:
        source = self._repository.get(run_id, CONTEXT_MEMORY_LIMIT)
        if source is None:
            raise RunContextNotFoundError(run_id)
        validate_run_context_source(source, run_id)
        return AgentContext(
            messages=(
                ModelMessage(
                    role=ModelRole.SYSTEM,
                    content=_system_context(source),
                ),
                *build_model_history(source),
            )
        )


def build_model_history(source: RunContextSource) -> tuple[ModelMessage, ...]:
    validate_run_context_source(source, source.run.run_id)
    current_user_messages = tuple(
        message
        for message in source.reduced_session.user_messages
        if message.message_id == source.run.user_message_id
        and message.run_id == source.run.run_id
    )
    if len(current_user_messages) != 1:
        raise RunContextIntegrityError(
            "The current run must own exactly one committed user message."
        )

    steps = [
        _HistoryStep(
            sequence=message.created_sequence,
            messages=(ModelMessage(role=ModelRole.USER, content=message.content),),
        )
        for message in source.reduced_session.user_messages
    ]
    for run in source.reduced_session.runs:
        for assistant in run.assistants:
            visible = _visible_assistant_step(run, assistant)
            if visible is not None:
                steps.append(
                    _HistoryStep(
                        sequence=assistant.created_sequence,
                        messages=visible,
                    )
                )
    steps.sort(key=lambda item: item.sequence)
    return tuple(message for step in steps for message in step.messages)


def validate_run_context_source(source: RunContextSource, run_id: str) -> None:
    matching_runs = tuple(
        run for run in source.reduced_session.runs if run.run_id == run_id
    )
    if (
        source.run.run_id != run_id
        or len(matching_runs) != 1
        or matching_runs[0] != source.run
        or source.run.session_id != source.session.id
        or source.reduced_session.session_id != source.session.id
        or source.session.workspace_id != source.workspace.id
        or any(
            memory.workspace_id != source.workspace.id
            for memory in source.memories.items
        )
    ):
        raise RunContextIntegrityError(
            "The committed run context contains inconsistent ownership."
        )


def _visible_assistant_step(
    run: ReducedRun, assistant: ReducedAssistant
) -> tuple[ModelMessage, ...] | None:
    if assistant.status != "completed" or assistant.finish_reason is None:
        return None
    calls = tuple(
        sorted(
            (
                call
                for call in run.tool_calls
                if call.message_id == assistant.message_id
                and call.step == assistant.step
                and call.attempt == assistant.attempt
            ),
            key=lambda item: item.batch_index,
        )
    )
    if assistant.finish_reason == "stop":
        if calls:
            raise RunContextIntegrityError(
                "A stop completion cannot own committed tool calls."
            )
        return (ModelMessage(role=ModelRole.ASSISTANT, content=assistant.content),)
    if not _complete_tool_batch(calls):
        return None
    model_calls = tuple(
        ModelToolCall(
            call_id=call.provider_call_id,
            name=call.name,
            arguments=call.arguments,
        )
        for call in calls
    )
    assistant_message = ModelMessage(
        role=ModelRole.ASSISTANT,
        content=assistant.content,
        tool_calls=model_calls,
    )
    results = tuple(
        ModelMessage(
            role=ModelRole.TOOL,
            content=_json_text(call.result),
            tool_call_id=call.provider_call_id,
        )
        for call in calls
    )
    return (assistant_message, *results)


def _complete_tool_batch(calls: tuple[ReducedToolCall, ...]) -> bool:
    return bool(calls) and all(
        call.batch_index == index and call.status == "completed"
        for index, call in enumerate(calls)
    )


def _system_context(source: RunContextSource) -> str:
    memories = source.memories
    payload = {
        "workspace": {
            "id": source.workspace.id,
            "name": source.workspace.name,
        },
        "session": {
            "id": source.session.id,
            "title": source.session.title,
        },
        "map_context": dict(source.run.map_snapshot),
        "confirmed_memories": {
            "items": [
                {
                    "id": item.id,
                    "content": item.content,
                    "created_at": item.created_at.isoformat(),
                }
                for item in memories.items
            ],
            "total_count": memories.total_count,
            "truncated": len(memories.items) < memories.total_count,
        },
        "available_tools": [
            "workspace.get_context",
            "memory.search",
            "workspace.memory.save",
        ],
    }
    return (
        "Use the server-bound workspace and session scope below. "
        "Do not invent or replace scope identifiers. "
        "workspace.memory.save always requires user confirmation.\n"
        + _json_text(payload)
    )


def _json_text(value: object) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
