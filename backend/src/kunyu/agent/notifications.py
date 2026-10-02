"""Agent-scoped non-vetoing lifecycle, inbox and assistant publications."""

import asyncio
import inspect
import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from datetime import datetime
from types import MappingProxyType
from typing import TYPE_CHECKING, Literal

from kunyu.agent.runtime.events import (
    AgentEvent,
    AssistantStartedPayload,
    InboxMessagePayload,
    InboxSplicedPayload,
    ModelAttemptFinishedPayload,
    QueueReorderedPayload,
)
from kunyu.agent.runtime.models import ModelOutput, ModelToolCall
from kunyu.agent.runtime.run_state import ReducedRun
from kunyu.agent.scope import Context, ScopedEntries
from kunyu.persistence.event_publications import SessionEventPublication

if TYPE_CHECKING:
    from kunyu.agent.hooks import AgentHookRegistry
    from kunyu.agent.session_agent import SessionAgent

logger = logging.getLogger(__name__)
type AgentStatus = Literal["idle", "running"]


@dataclass(frozen=True, slots=True)
class StatusNotification:
    agent: "SessionAgent"
    status: AgentStatus


@dataclass(frozen=True, slots=True)
class InboxNotification:
    agent: "SessionAgent"
    message: InboxMessagePayload
    target: Literal["next-step", "next-turn"]
    run_id: str | None
    step: int | None
    sequence: int


@dataclass(frozen=True, slots=True)
class AssistantStartFrame:
    attempt_id: str
    revision: int
    run_id: str
    step: int
    attempt: int
    type: Literal["start"] = "start"


@dataclass(frozen=True, slots=True)
class AssistantChunkFrame:
    attempt_id: str
    revision: int
    index: int
    time: int
    chunk: ModelOutput
    type: Literal["chunk"] = "chunk"


@dataclass(frozen=True, slots=True)
class CommittedAssistantOutcome:
    event_type: Literal["model.attempt.finished"]
    sequence: int
    outcome: Literal[
        "stop", "tool_calls", "length", "content_filter", "cancelled", "error"
    ]
    kind: Literal["committed"] = "committed"


@dataclass(frozen=True, slots=True)
class AbandonedAssistantOutcome:
    kind: Literal["abandoned"] = "abandoned"


@dataclass(frozen=True, slots=True)
class AssistantEndFrame:
    attempt_id: str
    revision: int
    index: int
    outcome: CommittedAssistantOutcome | AbandonedAssistantOutcome
    type: Literal["end"] = "end"


type AssistantStreamFrame = (
    AssistantStartFrame | AssistantChunkFrame | AssistantEndFrame
)


@dataclass(frozen=True, slots=True)
class AssistantStreamNotification:
    agent: "SessionAgent"
    frame: AssistantStreamFrame


class ObserverRegistry[T]:
    def __init__(self) -> None:
        self._entries: ScopedEntries[tuple[Context, Callable[[T], object]]] = (
            ScopedEntries()
        )

    def register(
        self, owner: Context, name: str, handler: Callable[[T], object]
    ) -> None:
        self._entries.register(owner, name, (owner, handler))

    def emit(self, scope: Context, notification: T, *, name: str) -> None:
        for owner, handler in self._entries.view_scope(scope.scope).values():
            # Each observer gets its own mutable inbox snapshot. Stream frames are immutable.
            payload = (
                replace(
                    notification, message=notification.message.model_copy(deep=True)
                )
                if isinstance(notification, InboxNotification)
                else notification
            )
            invoke_observer(
                owner, lambda handler=handler, payload=payload: handler(payload), name
            )


def invoke_observer(owner: Context, invoke: Callable[[], object], name: str) -> None:
    if not owner.active:
        return
    try:
        owner.assert_active()
        returned = invoke()
        if inspect.isawaitable(returned):
            started = False

            async def observe() -> None:
                nonlocal started
                started = True
                try:
                    await returned
                except asyncio.CancelledError:
                    raise
                except BaseException:
                    logger.exception("Agent %s observer rejected.", name)

            task = asyncio.create_task(observe())

            async def drain() -> None:
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

            detach = owner.effect(drain)

            def settled(_: asyncio.Task) -> None:
                detach()
                if not started:
                    if inspect.iscoroutine(returned):
                        returned.close()
                    elif isinstance(returned, asyncio.Future):
                        returned.cancel()

            task.add_done_callback(settled)
    except BaseException:
        logger.exception("Agent %s observer failed.", name)


@dataclass(slots=True)
class _AssistantAttempt:
    attempt_id: str
    index: int = 0


def _freeze(value: object) -> object:
    if isinstance(value, Mapping):
        return MappingProxyType({key: _freeze(item) for key, item in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(_freeze(item) for item in value)
    return value


class AgentNotifications:
    def __init__(self, agent: "SessionAgent", hooks: "AgentHookRegistry") -> None:
        self._agent, self._hooks = agent, hooks
        self._status: AgentStatus = "idle"
        self._revision = 0
        self._attempts: dict[tuple[str, int, int], _AssistantAttempt] = {}

    @property
    def status(self) -> AgentStatus:
        return self._status

    def set_status(self, status: AgentStatus) -> None:
        if status == self._status:
            return
        self._status = status
        self._hooks.status.emit(
            self._agent.ctx, StatusNotification(self._agent, status), name="status"
        )

    def _next_revision(self) -> int:
        self._revision += 1
        return self._revision

    def _stream(self, frame: AssistantStreamFrame) -> None:
        self._hooks.assistant_stream.emit(
            self._agent.ctx,
            AssistantStreamNotification(self._agent, frame),
            name="assistant-stream",
        )

    def output(self, run: ReducedRun, output: ModelOutput, now: datetime) -> None:
        attempt = self._attempts[(run.run_id, run.step, run.attempt)]
        if isinstance(output, ModelToolCall):
            output = ModelToolCall(
                output.call_id, output.name, _freeze(output.arguments)
            )
        self._stream(
            AssistantChunkFrame(
                attempt.attempt_id,
                self._next_revision(),
                attempt.index,
                int(now.timestamp() * 1_000),
                output,
            )
        )
        attempt.index += 1

    def abandon(self, run: ReducedRun) -> None:
        attempt = self._attempts.pop((run.run_id, run.step, run.attempt), None)
        if attempt is not None:
            self._stream(
                AssistantEndFrame(
                    attempt.attempt_id,
                    self._next_revision(),
                    attempt.index,
                    AbandonedAssistantOutcome(),
                )
            )

    def committed(self, publication: SessionEventPublication) -> None:
        if any(
            event.event_type == "agent/inbox/spliced" for event in publication.events
        ):
            self._inbox(publication)
        for event in publication.events:
            if event.event_type == "message.assistant.started":
                payload = AssistantStartedPayload.model_validate(event.payload)
                key = (event.run_id, payload.step, payload.attempt)
                if key in self._attempts:
                    raise RuntimeError("An assistant attempt was started twice.")
                self._attempts[key] = _AssistantAttempt(payload.message_id)
                self._stream(
                    AssistantStartFrame(
                        payload.message_id,
                        self._next_revision(),
                        event.run_id,
                        payload.step,
                        payload.attempt,
                    )
                )
            elif event.event_type == "model.attempt.finished":
                payload = ModelAttemptFinishedPayload.model_validate(event.payload)
                attempt = self._attempts.pop(
                    (event.run_id, payload.step, payload.attempt), None
                )
                # Restart settlement has no live attempt to end.
                if attempt is not None:
                    self._stream(
                        AssistantEndFrame(
                            attempt.attempt_id,
                            self._next_revision(),
                            attempt.index,
                            CommittedAssistantOutcome(
                                "model.attempt.finished",
                                event.sequence,
                                payload.outcome,
                            ),
                        )
                    )

    def _inbox(self, publication: SessionEventPublication) -> None:
        before = publication.inbox_before
        queues: dict[str, list[InboxMessagePayload]] = {
            "next-step": [],
            "next-turn": [],
        }
        if before is not None:
            messages = {message.message_id: message for message in before.user_messages}
            queues["next-step"] = [
                InboxMessagePayload(
                    message_id=identity,
                    content=messages[identity].content,
                    map_context=messages[identity].map_context,
                )
                for identity in before.next_step
            ]
            queues["next-turn"] = list(before.next_turn)
        for event in publication.events:
            if event.event_type == "agent/queue/reordered":
                order = QueueReorderedPayload.model_validate(event.payload).message_ids
                indexed = {item.message_id: item for item in queues["next-turn"]}
                queues["next-turn"] = [indexed[identity] for identity in order]
            elif event.event_type == "agent/inbox/spliced":
                payload = InboxSplicedPayload.model_validate(event.payload)
                queue = queues[payload.target]
                stop = payload.start + payload.delete_count
                removed = queue[payload.start : stop]
                queue[payload.start : stop] = payload.messages
                registry = (
                    self._hooks.inbox_claimed
                    if payload.disposition == "claim"
                    else self._hooks.inbox_discarded
                )
                for message in removed:
                    registry.emit(
                        self._agent.ctx,
                        self._inbox_payload(event, payload, message),
                        name=f"inbox/{payload.disposition}ed",
                    )
                for message in payload.messages:
                    self._hooks.inbox_inserted.emit(
                        self._agent.ctx,
                        self._inbox_payload(event, payload, message),
                        name="inbox/inserted",
                    )

    def _inbox_payload(
        self,
        event: AgentEvent,
        payload: InboxSplicedPayload,
        message: InboxMessagePayload,
    ) -> InboxNotification:
        return InboxNotification(
            self._agent,
            message,
            payload.target,
            payload.target_run_id,
            payload.step,
            event.sequence,
        )
