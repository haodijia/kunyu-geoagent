"""Append changed runtime facts after admitted input, preserving earlier snapshots."""

import json
from datetime import UTC, datetime

from kunyu.agent.prompt_files import prompt_text
from kunyu.agent.runtime.events import (
    ContextInjectedEvent,
    ContextInjectedPayload,
    EventBatch,
    EventStore,
)
from kunyu.domain.agent_context import RunContextSource


async def prepare_workspace_context(
    source: RunContextSource, events: EventStore
) -> None:
    payload = {
        "workspace": {"id": source.workspace.id, "name": source.workspace.name},
        "session": {"id": source.session.id, "title": source.session.title},
        "map_context": dict(source.run.map_snapshot),
    }
    content = prompt_text(
        "context.yaml",
        "workspace",
        scope=json.dumps(
            payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True
        ),
    )
    previous = next(
        (
            item
            for item in reversed(source.injected_context)
            if item.producer == "workspace"
            and item.sequence > source.controls.compacted_through
        ),
        None,
    )
    if previous is not None and previous.content == content:
        return
    await events.commit(
        EventBatch(
            session_id=source.session.id,
            run_id=None,
            events=(
                ContextInjectedEvent(
                    session_id=source.session.id,
                    run_id=None,
                    event_type="context.injected",
                    payload=ContextInjectedPayload(
                        content=content,
                        producer="workspace",
                        metadata={"run_id": source.run.run_id, "step": source.run.step},
                    ),
                    occurred_at=datetime.now(UTC),
                ),
            ),
        )
    )
