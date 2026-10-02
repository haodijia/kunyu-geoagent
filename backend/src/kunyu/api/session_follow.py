"""One ordered durable journal and cursorless assistant stream subscription."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Callable
from dataclasses import asdict
from uuid import uuid4

from fastapi import Request

from kunyu.agent import services as s
from kunyu.agent.notifications import (
    AssistantChunkFrame,
    AssistantStartFrame,
    AssistantStreamFrame,
    AssistantStreamNotification,
)
from kunyu.agent.runtime.assistant_stream import snapshot_chunk
from kunyu.agent.session_agent import SessionAgent
from kunyu.application.messages import MessageService
from kunyu.domain.events import AgentEvent
from kunyu.persistence.event_publications import SessionEventPublication

logger = logging.getLogger(__name__)
MAX_PENDING_FRAMES = 2048


def wire_frame(frame: AssistantStreamFrame, cursor: int) -> dict:
    if isinstance(frame, AssistantChunkFrame):
        return {
            "type": "chunk",
            "attempt_id": frame.attempt_id,
            "revision": frame.revision,
            "index": frame.index,
            "time": frame.time,
            "chunk": snapshot_chunk(frame.chunk).model_dump(mode="json"),
        }
    value = asdict(frame)
    if isinstance(frame, AssistantStartFrame):
        value["started_after_sequence"] = cursor
    return value


def cursorless(event: str, value: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(value, ensure_ascii=False, allow_nan=False)}\n\n"


async def follow_session(
    request: Request,
    service: MessageService,
    agent: SessionAgent,
    after_sequence: int,
    format_event: Callable[[AgentEvent], str],
    serialize_event: Callable[[AgentEvent], dict],
) -> AsyncIterator[str]:
    # Share the Agent's scope carrier; a separate child scope cannot observe it.
    owner = agent.ctx.child(scoped=False)
    loop = asyncio.get_running_loop()
    pending: asyncio.Queue[tuple[int, dict | None]] = asyncio.Queue(MAX_PENDING_FRAMES)
    overflow = asyncio.Event()
    closed = asyncio.Event()

    def enqueue(cursor: int, frame: dict | None) -> None:
        if closed.is_set():
            return
        if pending.full():
            overflow.set()
        else:
            pending.put_nowait((cursor, frame))

    def assistant(notification: AssistantStreamNotification) -> None:
        cursor = agent.notifications.durable_sequence
        frame = wire_frame(notification.frame, cursor)
        loop.call_soon_threadsafe(enqueue, cursor, frame)

    def committed(publication: SessionEventPublication) -> None:
        if publication.after.session_id == agent.session_id:
            loop.call_soon_threadsafe(enqueue, publication.events[-1].sequence, None)

    owner.effect(closed.set)
    owner.require(s.HOOKS).assistant_stream.register(
        owner, f"web-follow-{uuid4()}", assistant
    )
    owner.effect(owner.require(s.DATABASE).publications.subscribe(committed))
    try:
        # No await between subscribing, reading the journal and taking the prefix cut.
        events = service.list_events_after(agent.session_id, after_sequence)
        current = events[-1].sequence if events else after_sequence
        baseline = agent.notifications.stream_baseline()
        revision_cut = baseline["revision"]
        yield cursorless(
            "session.opened",
            {
                "cursor": current,
                "events": [serialize_event(event) for event in events],
                "assistant_stream": baseline,
            },
        )
        while not closed.is_set() and not request.app.state.closing_event.is_set():
            if overflow.is_set():
                raise RuntimeError(
                    "Session follower exceeded its frame buffer; reconnect required."
                )
            if await request.is_disconnected():
                return
            try:
                cursor, frame = await asyncio.wait_for(pending.get(), timeout=0.25)
            except TimeoutError:
                continue
            # Flush only through the observed frame boundary, never a future settlement.
            if cursor > current:
                for event in service.list_events_after(agent.session_id, current):
                    if event.sequence > cursor:
                        break
                    if event.sequence != current + 1:
                        raise RuntimeError(
                            "Session follower encountered a durable sequence gap."
                        )
                    yield format_event(event)
                    current = event.sequence
                if current != cursor:
                    raise RuntimeError(
                        "Assistant frame references an unavailable durable boundary."
                    )
            if frame is not None and frame["revision"] > revision_cut:
                revision_cut = frame["revision"]
                yield cursorless("assistant.stream", frame)
    except Exception:
        logger.exception("Session follow failed for %s", agent.session_id)
        raise
    finally:
        await owner.close()
