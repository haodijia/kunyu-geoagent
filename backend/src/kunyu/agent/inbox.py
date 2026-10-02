"""Session-owned next-step input, reconstructed from durable inbox splices."""

from datetime import UTC, datetime

from kunyu.agent.runtime.events import (
    EventBatch,
    EventStore,
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
