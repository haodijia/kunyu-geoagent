"""Session-owned next-step input, reconstructed from durable inbox splices."""

from datetime import UTC, datetime
from typing import Literal

from kunyu.agent.runtime.events import (
    EventBatch,
    EventDraft,
    EventStore,
    InboxMessagePayload,
    InboxSplicedEvent,
    InboxSplicedPayload,
    QueueDispatchedEvent,
    QueueDispatchedPayload,
    QueueModeEvent,
    QueueModePayload,
    QueueReorderedEvent,
    QueueReorderedPayload,
)
from kunyu.agent.runtime.session_reducer import reduce_session
from kunyu.agent.runtime.session_state import ReducedSession, ReducedUserMessage


class SessionInbox:
    def __init__(self, session_id: str, events: EventStore) -> None:
        self.session_id = session_id
        self._events = events

    async def state(self) -> ReducedSession:
        return reduce_session(await self._events.list_after(self.session_id, 0))

    async def set_mode(self, mode: Literal["auto", "manual"]) -> None:
        await self._events.commit(
            EventBatch(
                session_id=self.session_id,
                run_id=None,
                events=(
                    QueueModeEvent(
                        session_id=self.session_id,
                        event_type="agent/queue/mode",
                        payload=QueueModePayload(mode=mode),
                        occurred_at=datetime.now(UTC),
                    ),
                ),
            )
        )

    async def reorder(self, message_ids: tuple[str, ...]) -> None:
        state = await self.state()
        current = {item.message_id for item in state.next_turn}
        if len(message_ids) != len(current) or set(message_ids) != current:
            raise InboxQueueConflictError(
                "The pending queue changed before it could be reordered."
            )
        await self._events.commit(
            EventBatch(
                session_id=self.session_id,
                run_id=None,
                events=(
                    QueueReorderedEvent(
                        session_id=self.session_id,
                        event_type="agent/queue/reordered",
                        payload=QueueReorderedPayload(message_ids=list(message_ids)),
                        occurred_at=datetime.now(UTC),
                    ),
                ),
            )
        )

    async def dispatch(self, message_id: str) -> None:
        state = await self.state()
        order = [item.message_id for item in state.next_turn]
        if message_id not in order:
            raise InboxMessageNotFoundError(message_id)
        order.remove(message_id)
        order.insert(0, message_id)
        now = datetime.now(UTC)
        await self._events.commit(
            EventBatch(
                session_id=self.session_id,
                run_id=None,
                events=(
                    QueueReorderedEvent(
                        session_id=self.session_id,
                        event_type="agent/queue/reordered",
                        payload=QueueReorderedPayload(message_ids=order),
                        occurred_at=now,
                    ),
                    QueueDispatchedEvent(
                        session_id=self.session_id,
                        event_type="agent/queue/dispatched",
                        payload=QueueDispatchedPayload(message_id=message_id),
                        occurred_at=now,
                    ),
                ),
            )
        )

    async def next_step(self, run_id: str) -> tuple[ReducedUserMessage, ...]:
        state = await self.state()
        pending = set(state.next_step)
        return tuple(
            message
            for message in state.user_messages
            if message.message_id in pending and message.run_id == run_id
        )

    async def claim(self, run_id: str, step: int) -> tuple[ReducedUserMessage, ...]:
        return await self._remove(run_id, step=step)

    async def discard(self, run_id: str) -> None:
        await self._remove(run_id, step=None)

    async def _remove(
        self, run_id: str, *, step: int | None
    ) -> tuple[ReducedUserMessage, ...]:
        pending = await self.next_step(run_id)
        if pending:
            await self._events.commit(
                EventBatch(
                    session_id=self.session_id,
                    run_id=None,
                    events=(
                        InboxSplicedEvent(
                            session_id=self.session_id,
                            event_type="agent/inbox/spliced",
                            payload=InboxSplicedPayload(
                                target="next-step",
                                target_run_id=run_id,
                                start=0,
                                delete_count=len(pending),
                                messages=[],
                                disposition="discard" if step is None else "claim",
                                step=step,
                            ),
                            occurred_at=datetime.now(UTC),
                        ),
                    ),
                )
            )
        return pending

    async def next_turn(self) -> tuple[InboxMessagePayload, ...]:
        state = await self.state()
        return state.next_turn

    async def clear_next_turn(self) -> None:
        state = await self.state()
        events: list[EventDraft] = []
        now = datetime.now(UTC)
        for index, item in reversed(tuple(enumerate(state.next_turn))):
            if item.turn is None:
                raise RuntimeError("Queued input has no turn configuration.")
            events.append(
                InboxSplicedEvent(
                    session_id=self.session_id,
                    event_type="agent/inbox/spliced",
                    payload=InboxSplicedPayload(
                        target="next-turn",
                        target_run_id=item.turn.run_id,
                        start=index,
                        delete_count=1,
                        messages=[],
                        disposition="discard",
                    ),
                    occurred_at=now,
                )
            )
        if events:
            await self._events.commit(
                EventBatch(
                    session_id=self.session_id, run_id=None, events=tuple(events)
                )
            )

    async def remove(self, message_id: str) -> None:
        state = await self.state()
        for index, item in enumerate(state.next_turn):
            if item.message_id == message_id:
                if item.turn is None:
                    raise RuntimeError("Queued input has no turn configuration.")
                await self._discard_item("next-turn", item.turn.run_id, index)
                return
        for index, pending_id in enumerate(state.next_step):
            if pending_id == message_id:
                message = next(
                    item
                    for item in state.user_messages
                    if item.message_id == message_id
                )
                if message.run_id is None:
                    raise RuntimeError("Steering input has no target run.")
                await self._discard_item("next-step", message.run_id, index)
                return
        raise InboxMessageNotFoundError(message_id)

    async def cancel(self) -> None:
        state = await self.state()
        for message_id in (
            *state.next_step,
            *(item.message_id for item in state.next_turn),
        ):
            await self.remove(message_id)

    async def _discard_item(
        self, target: Literal["next-step", "next-turn"], run_id: str, index: int
    ) -> None:
        await self._events.commit(
            EventBatch(
                session_id=self.session_id,
                run_id=None,
                events=(
                    InboxSplicedEvent(
                        session_id=self.session_id,
                        event_type="agent/inbox/spliced",
                        payload=InboxSplicedPayload(
                            target=target,
                            target_run_id=run_id,
                            start=index,
                            delete_count=1,
                            messages=[],
                            disposition="discard",
                        ),
                        occurred_at=datetime.now(UTC),
                    ),
                ),
            )
        )


class InboxMessageNotFoundError(LookupError):
    pass


class InboxQueueConflictError(ValueError):
    pass
