import json
from dataclasses import dataclass

from kunyu.agent.inbox import SessionInbox
from kunyu.agent.prompt_files import prompt_text, read_prompt
from kunyu.agent.runtime.content import ToolCallBlock, text_content
from kunyu.agent.runtime.context import (
    AgentContext,
    ContextPreparationRegistry,
    PromptSection,
    PromptSectionRegistry,
)
from kunyu.agent.runtime.events import EventStore, StepMessagePayload
from kunyu.agent.runtime.image_offload import apply_offloads
from kunyu.agent.runtime.input_content import InputMessageSource, user_content
from kunyu.agent.runtime.models import ModelMessage, ModelRole
from kunyu.agent.runtime.run_state import ReducedAssistant, ReducedRun, ReducedToolCall
from kunyu.agent.scope import Context
from kunyu.domain.agent_context import (
    InjectedContext,
    RunContextRepository,
    RunContextSource,
)
from kunyu.domain.map_context import TurnMapContext


class RunContextNotFoundError(LookupError):
    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        super().__init__(f"Run '{run_id}' was not found.")


class RunContextIntegrityError(RuntimeError):
    """Committed Agent facts cannot form a safe model-visible history."""


@dataclass(frozen=True, slots=True)
class ModelHistoryNode:
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
        proposals = []
        for message in (*initial, *claimed):
            content = message.content
            frozen_map = (
                source.run.map_snapshot
                if message.delivery == "followup"
                else message.map_context
            )
            selection = TurnMapContext.model_validate(frozen_map).image_selection
            if message.source == "user" and selection is not None:
                content += "\n\n" + prompt_text(
                    "context.yaml",
                    "map_selection",
                    candidate_set_id=selection.candidate_set_id,
                    image_id=str(selection.image_id),
                )
            proposals.append(
                StepMessagePayload(
                    message_id=message.message_id,
                    content=content,
                    source=message.source,
                    attachments=message.attachments,
                )
            )
        return tuple(proposals)

    async def build(self, run_id: str) -> AgentContext:
        await self._preparers.prepare(run_id, self._scope)
        source = self._require_source(run_id)
        return AgentContext(
            messages=(
                ModelMessage(
                    role=ModelRole.SYSTEM,
                    content=text_content(self._prompts.render(source, self._scope)),
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
    return tuple(
        message
        for node in build_model_history_nodes(source)
        for message in node.messages
    )


def build_model_history_nodes(source: RunContextSource) -> tuple[ModelHistoryNode, ...]:
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
        ModelHistoryNode(
            sequence=message.created_sequence,
            messages=(
                ModelMessage(
                    role=ModelRole.USER,
                    content=user_content(message.content, message.attachments),
                    context_source=message.source if message.source != "user" else None,
                    input_source=InputMessageSource(
                        sequence=message.created_sequence, message_id=message.message_id
                    ),
                ),
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
    steps.extend(
        ModelHistoryNode(
            sequence=decision.sequence,
            messages=tuple(
                ModelMessage(
                    ModelRole.USER,
                    user_content(message.content, message.attachments),
                    context_source=message.source if message.source != "user" else None,
                    input_source=InputMessageSource(
                        sequence=decision.sequence, message_id=message.message_id
                    ),
                )
                for message in decision.payload.messages
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
        ModelHistoryNode(
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
                    ModelHistoryNode(
                        sequence=assistant.created_sequence,
                        messages=visible,
                    )
                )
    steps.sort(key=lambda item: item.sequence)
    visible = tuple(
        ModelHistoryNode(
            sequence=step.sequence,
            messages=apply_offloads(
                step.messages, source.reduced_session.offloaded_images
            ),
        )
        for step in steps
        if step.sequence > source.controls.compacted_through
    )
    if source.controls.summary is None:
        return visible
    return (
        ModelHistoryNode(
            sequence=source.controls.compacted_through,
            messages=(
                ModelMessage(
                    ModelRole.USER,
                    text_content(source.controls.summary),
                    context_source="compaction",
                ),
            ),
        ),
        *visible,
    )


def _visible_injection(item: InjectedContext, source: RunContextSource) -> bool:
    if item.producer == "workspace":
        return False
    if item.producer not in {
        "skill-invocation",
        "runtime-context",
        "agent-instructions",
        "time-context",
    }:
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
                    source_model=assistant.source_model,
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
                source_model=assistant.source_model,
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
        source_model=assistant.source_model,
    )
    results = tuple(
        ModelMessage(
            role=ModelRole.TOOL,
            content=call.content
            if call.status == "completed"
            else text_content(
                _json_text(
                    {
                        "status": call.status,
                        "error_code": call.error_code,
                        "error_summary": call.error_summary,
                    }
                )
            ),
            input_source=InputMessageSource(
                sequence=call.updated_sequence, message_id=call.tool_call_id
            )
            if call.status == "completed"
            else None,
            tool_call_id=call.provider_call_id,
            is_error=call.status != "completed",
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


def _identity_prompt(value: object) -> str:
    _require_source(value)
    return read_prompt("system.md")


def _json_text(value: object) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
