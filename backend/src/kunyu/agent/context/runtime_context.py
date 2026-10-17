"""Durable runtime facts are appended only when their retained snapshot changes."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from pydantic import JsonValue

from kunyu.agent.prompts.loader import prompt_text
from kunyu.agent.runtime.events.session import ContextInjectedPayload
from kunyu.domain.conversation.agent_context import InjectedContext, RunContextSource


def retained_snapshot(
    source: RunContextSource, producer: str
) -> InjectedContext | None:
    return next(
        (
            item
            for item in reversed(source.injected_context)
            if item.producer == producer
            and item.sequence > source.controls.compacted_through
        ),
        None,
    )


def snapshot_payload(
    source: RunContextSource, producer: str, content: str, **metadata: JsonValue
) -> ContextInjectedPayload | None:
    previous = retained_snapshot(source, producer)
    if previous is not None and previous.content == content:
        return None
    return ContextInjectedPayload(
        content=content,
        producer=producer,
        metadata={**metadata, "run_id": source.run.run_id, "step": source.run.step},
    )


def runtime_payload(
    source: RunContextSource, *, child: bool
) -> ContextInjectedPayload | None:
    readonly = (
        child
        or source.controls.plan_active
        or source.controls.permission == "read-only"
    )
    sections = [
        {
            "name": "file:permission",
            "text": prompt_text(
                "context.yaml",
                "permission_read_only" if readonly else "permission_workspace_write",
            ),
        },
        {
            "name": "approval:policy",
            "text": prompt_text(
                "context.yaml", "approval_denied" if readonly else "approval_required"
            ),
        },
    ]
    if child:
        sections.append(
            {
                "name": "subagent:delegation",
                "text": prompt_text("context.yaml", "subagent_delegation"),
            }
        )
    return snapshot_payload(
        source,
        "runtime-context",
        "\n\n".join(section["text"] for section in sections),
        sections=sections,
    )


def time_payload(
    source: RunContextSource, now: datetime, zone: ZoneInfo, refresh_seconds: int
) -> ContextInjectedPayload | None:
    if now.tzinfo is None:
        raise ValueError("Runtime context clock must include a time zone.")
    now = now.astimezone(UTC)
    previous = retained_snapshot(source, "time-context")
    if previous is not None:
        elapsed = (
            now - datetime.fromisoformat(previous.metadata["time"])
        ).total_seconds()
        if 0 <= elapsed < refresh_seconds:
            return None
    return ContextInjectedPayload(
        content=prompt_text(
            "context.yaml",
            "current_time",
            timestamp=now.astimezone(zone).isoformat(timespec="seconds"),
            timezone=zone.key,
        ),
        producer="time-context",
        metadata={
            "time": now.isoformat(),
            "run_id": source.run.run_id,
            "step": source.run.step,
        },
    )
