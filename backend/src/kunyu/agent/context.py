import json
from dataclasses import dataclass
from pathlib import Path

from kunyu.agent.inbox import SessionInbox
from kunyu.agent.runtime.context import (
    AgentContext,
    ContextPreparationRegistry,
    PromptSection,
    PromptSectionRegistry,
)
from kunyu.agent.runtime.events import EventStore
from kunyu.agent.runtime.models import ModelMessage, ModelRole, ModelToolCall
from kunyu.agent.runtime.run_state import ReducedAssistant, ReducedRun, ReducedToolCall
from kunyu.agent.scope import Context
from kunyu.domain.agent_context import RunContextRepository, RunContextSource

SYSTEM_PROMPT_PATH = Path(__file__).parent / "prompts" / "system.md"


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
    def __init__(
        self,
        repository: RunContextRepository,
        prompts: PromptSectionRegistry,
        scope: Context,
        preparers: ContextPreparationRegistry,
        events: EventStore,
    ) -> None:
        self._repository = repository
        self._prompts = prompts
        self._scope = scope
        self._preparers = preparers
        self._events = events

    async def build(self, run_id: str) -> AgentContext:
        source = self._require_source(run_id)
        await SessionInbox(source.session.id, self._events).claim(
            run_id, source.run.step
        )
        await self._preparers.prepare(run_id, self._scope)
        source = self._require_source(run_id)
        return AgentContext(
            messages=(
                ModelMessage(
                    role=ModelRole.SYSTEM,
                    content=self._prompts.render(source, self._scope),
                ),
                ModelMessage(
                    role=ModelRole.USER,
                    content=_scope_prompt(source),
                    context_source="workspace",
                ),
                *build_model_history(source),
            )
        )

    def _require_source(self, run_id: str) -> RunContextSource:
        source = self._repository.get(run_id)
        if source is None:
            raise RunContextNotFoundError(run_id)
        validate_run_context_source(source, run_id)
        return source

    async def has_pending(self, run_id: str) -> bool:
        source = self._require_source(run_id)
        pending = set(source.reduced_session.next_step)
        return any(
            message.run_id == run_id and message.message_id in pending
            for message in source.reduced_session.user_messages
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
            messages=(ModelMessage(role=ModelRole.USER, content=message.content),)
            + (
                (
                    ModelMessage(
                        role=ModelRole.USER,
                        content=_json_text(message.map_context),
                        context_source="steering-map",
                    ),
                )
                if message.delivery == "steer"
                else ()
            ),
        )
        for message in source.reduced_session.user_messages
        if not message.discarded
        and (
            (
                message.delivery == "followup"
                and message.created_sequence
                <= current_user_messages[0].created_sequence
            )
            or (
                message.delivery == "steer"
                and message.applied_step is not None
                and (
                    message.run_id == source.run.run_id
                    or message.created_sequence <= source.run.created_sequence
                )
            )
        )
    ]
    steps.extend(
        _HistoryStep(
            sequence=item.sequence,
            messages=(
                ModelMessage(
                    role=ModelRole.USER,
                    content=item.content,
                    context_source=item.producer,
                ),
            ),
        )
        for item in source.injected_context
    )
    for run in source.reduced_session.runs:
        if run.created_sequence > source.run.created_sequence:
            continue
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
    visible = tuple(
        message
        for step in steps
        if step.sequence > source.controls.compacted_through
        for message in step.messages
    )
    if source.controls.summary is None:
        return visible
    return (
        ModelMessage(
            ModelRole.USER, source.controls.summary, context_source="compaction"
        ),
        *visible,
    )


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
    ):
        raise RunContextIntegrityError(
            "The committed run context contains inconsistent ownership."
        )


def _visible_assistant_step(
    run: ReducedRun, assistant: ReducedAssistant
) -> tuple[ModelMessage, ...] | None:
    if assistant.status in {"interrupted", "failed", "cancelled"}:
        if assistant.content:
            return (
                ModelMessage(
                    role=ModelRole.ASSISTANT,
                    content=assistant.content,
                    reasoning_content=assistant.reasoning_content,
                ),
            )
        return None
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
        return (
            ModelMessage(
                role=ModelRole.ASSISTANT,
                content=assistant.content,
                reasoning_content=assistant.reasoning_content,
            ),
        )
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
        reasoning_content=assistant.reasoning_content,
    )
    results = tuple(
        ModelMessage(
            role=ModelRole.TOOL,
            content=_json_text(
                call.result
                if call.status == "completed"
                else {
                    "status": call.status,
                    "error_code": call.error_code,
                    "error_summary": call.error_summary,
                }
            ),
            tool_call_id=call.provider_call_id,
        )
        for call in calls
    )
    return (assistant_message, *results)


def _complete_tool_batch(calls: tuple[ReducedToolCall, ...]) -> bool:
    return bool(calls) and all(
        call.batch_index == index
        and call.status in {"completed", "failed", "cancelled"}
        for index, call in enumerate(calls)
    )


def register_system_prompt(owner: Context, registry: PromptSectionRegistry) -> None:
    registry.register(owner, PromptSection("identity", 10, _identity_prompt))


def _require_source(value: object) -> RunContextSource:
    if not isinstance(value, RunContextSource):
        raise TypeError("Prompt source must be a RunContextSource.")
    return value


def _scope_prompt(value: object) -> str:
    source = _require_source(value)
    payload = {
        "workspace": {"id": source.workspace.id, "name": source.workspace.name},
        "session": {"id": source.session.id, "title": source.session.title},
        "map_context": dict(source.run.map_snapshot),
    }
    return (
        "Use the server-bound workspace and session scope below. "
        "Do not invent or replace scope identifiers.\n" + _json_text(payload)
    )


def _identity_prompt(value: object) -> str:
    _require_source(value)
    content = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()
    if not content:
        raise ValueError("The system prompt must not be empty.")
    return content


def _json_text(value: object) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
