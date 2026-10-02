"""Session-owned next-step input, reconstructed from durable inbox splices."""

from datetime import UTC, datetime
from typing import Literal

from kunyu.agent.runtime.events import (
    EventBatch,
    EventStore,
    InboxMessagePayload,
    InboxSplicedEvent,
    InboxSplicedPayload,
)
from kunyu.agent.runtime.session_reducer import reduce_session
from kunyu.agent.runtime.session_state import ReducedUserMessage


class SessionInbox:
    def __init__(self, session_id: str, events: EventStore) -> None:
        self.session_id = session_id
        self._events = events

    async def next_step(self, run_id: str) -> tuple[ReducedUserMessage, ...]:
        state = reduce_session(await self._events.list_after(self.session_id, 0))
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
        state = reduce_session(await self._events.list_after(self.session_id, 0))
        return state.next_turn

    async def remove(self, message_id: str) -> None:
        state = reduce_session(await self._events.list_after(self.session_id, 0))
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
        state = reduce_session(await self._events.list_after(self.session_id, 0))
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
