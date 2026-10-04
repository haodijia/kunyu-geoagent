import json
from dataclasses import dataclass
from pathlib import Path

from kunyu.agent.inbox import SessionInbox
from kunyu.agent.runtime.content import ToolCallBlock, text_content
from kunyu.agent.runtime.context import (
    AgentContext,
    ContextPreparationRegistry,
    PromptSection,
    PromptSectionRegistry,
)
from kunyu.agent.runtime.events import EventStore, StepMessagePayload
from kunyu.agent.runtime.models import ModelMessage, ModelRole
from kunyu.agent.runtime.run_state import ReducedAssistant, ReducedRun, ReducedToolCall
from kunyu.agent.scope import Context
from kunyu.domain.agent_context import (
    InjectedContext,
    RunContextRepository,
    RunContextSource,
)

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

    async def propose(self, run_id: str, step: int) -> tuple[StepMessagePayload, ...]:
        source = self._require_source(run_id)
        claimed = await SessionInbox(source.session.id, self._events).claim(
            run_id, step
        )
        initial = (
            tuple(
                message
                for message in source.reduced_session.user_messages
                if message.message_id == source.run.user_message_id
            )
            if not source.run.decisions
            else ()
        )
        return tuple(
            StepMessagePayload(message_id=message.message_id, content=message.content)
            for message in (*initial, *claimed)
        )

    async def build(self, run_id: str) -> AgentContext:
        await self._preparers.prepare(run_id, self._scope)
        source = self._require_source(run_id)
        return AgentContext(
            messages=(
                ModelMessage(
                    role=ModelRole.SYSTEM,
                    content=text_content(self._prompts.render(source, self._scope)),
                ),
                ModelMessage(
                    role=ModelRole.USER,
                    content=text_content(_scope_prompt(source)),
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

    admitted = tuple(
        decision
        for run in source.reduced_session.runs
        if run.created_sequence <= source.run.created_sequence
        for decision in run.decisions
    )
    replaced_inputs = {
        message_id for decision in admitted for message_id in decision.payload.input_ids
    }
    runs_by_id = {run.run_id: run for run in source.reduced_session.runs}
    steps = [
        _HistoryStep(
            sequence=message.created_sequence,
            messages=(
                ModelMessage(
                    role=ModelRole.USER, content=text_content(message.content)
                ),
            )
            + (
                (
                    ModelMessage(
                        role=ModelRole.USER,
                        content=text_content(_json_text(message.map_context)),
                        context_source="steering-map",
                    ),
                )
                if message.delivery == "steer"
                else ()
            ),
        )
        for message in source.reduced_session.user_messages
        if not message.discarded
        and message.message_id not in replaced_inputs
        and (
            (
                message.delivery == "followup"
                and message.run_id is not None
                and bool(runs_by_id[message.run_id].admitted_steps)
                and message.created_sequence
                <= current_user_messages[0].created_sequence
            )
            or (
                message.delivery == "steer"
                and message.applied_step is not None
                and message.run_id is not None
                and message.applied_step in runs_by_id[message.run_id].admitted_steps
                and (
                    message.run_id == source.run.run_id
                    or message.created_sequence <= source.run.created_sequence
                )
            )
        )
    ]
    original_messages = {
        item.message_id: item for item in source.reduced_session.user_messages
    }
    steps.extend(
        _HistoryStep(
            sequence=decision.sequence,
            messages=tuple(
                model_message
                for message in decision.payload.messages
                for model_message in (
                    ModelMessage(ModelRole.USER, text_content(message.content)),
                    *(
                        (
                            ModelMessage(
                                ModelRole.USER,
                                text_content(
                                    _json_text(
                                        original_messages[
                                            message.message_id
                                        ].map_context
                                    )
                                ),
                                context_source="steering-map",
                            ),
                        )
                        if message.message_id in original_messages
                        and original_messages[message.message_id].delivery == "steer"
                        else ()
                    ),
                )
            ),
        )
        for decision in admitted
        if decision.payload.kind == "enter"
        and any(
            decision in run.decisions
            and (
                decision.payload.step in run.admitted_steps
                or (
                    run.run_id == source.run.run_id
                    and decision.payload.step == source.run.step
                )
            )
            for run in source.reduced_session.runs
        )
    )
    steps.extend(
        _HistoryStep(
            sequence=item.sequence,
            messages=(
                ModelMessage(
                    role=ModelRole.USER,
                    content=text_content(item.content),
                    context_source=item.producer,
                ),
            ),
        )
        for item in source.injected_context
        if _visible_injection(item, source)
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
            ModelRole.USER,
            text_content(source.controls.summary),
            context_source="compaction",
        ),
        *visible,
    )


def _visible_injection(item: InjectedContext, source: RunContextSource) -> bool:
    if item.producer != "skill-invocation":
        return True
    owner = next(
        run
        for run in source.reduced_session.runs
        if run.run_id == item.metadata["run_id"]
    )
    step = item.metadata["step"]
    return step in owner.admitted_steps or (
        owner.run_id == source.run.run_id and step == source.run.step
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
    if assistant.status == "failed":
        return None
    if assistant.status in {"interrupted", "cancelled"}:
        if assistant.blocks:
            return (
                ModelMessage(
                    role=ModelRole.ASSISTANT,
                    content=assistant.blocks,
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
                content=assistant.blocks,
                replay_state=assistant.replay_state,
            ),
        )
    if not _complete_tool_batch(calls):
        return None
    model_calls = tuple(
        block for block in assistant.blocks if isinstance(block, ToolCallBlock)
    )
    if [
        (block.id, block.name, json.loads(block.arguments)) for block in model_calls
    ] != [(call.provider_call_id, call.name, call.arguments) for call in calls]:
        raise RunContextIntegrityError(
            "Canonical assistant blocks differ from the committed tool batch."
        )
    assistant_message = ModelMessage(
        role=ModelRole.ASSISTANT,
        content=assistant.blocks,
        replay_state=assistant.replay_state,
    )
    results = tuple(
        ModelMessage(
            role=ModelRole.TOOL,
            content=text_content(
                _json_text(
                    call.result
                    if call.status == "completed"
                    else {
                        "status": call.status,
                        "error_code": call.error_code,
                        "error_summary": call.error_summary,
                    }
                )
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
