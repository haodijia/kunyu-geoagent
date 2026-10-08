"""Publish catalog replacements and explicit user invocations as session facts."""

import re
from datetime import UTC, datetime

from kunyu.agent import services as s
from kunyu.agent.runtime.events import (
    ContextInjectedEvent,
    ContextInjectedPayload,
    EventBatch,
)
from kunyu.agent.scope import Context
from kunyu.agent.skills.render import catalog_entries, render_catalog, render_skill
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.agent.tools.shared import load_source

SKILL_GESTURE = re.compile(r"(?:^|\s)/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)")


async def prepare_skill_context(
    run_id: str,
    scope: Context,
    *,
    registration: ToolRegistration,
    catalog_description_max_length: int,
) -> None:
    source = load_source(scope.require(s.CONTEXTS), run_id)
    registry = scope.require(s.SKILLS)
    skills = await registry.list(scope, workspace_id=source.workspace.id)
    tool_visible = (
        scope.require(s.TOOLS).registration_for_run("skill", run_id) is registration
    )
    entries = (
        catalog_entries(
            tuple(skill for skill in skills if skill.model_invocable),
            catalog_description_max_length,
        )
        if tool_visible
        else []
    )
    catalogs = [
        item for item in source.injected_context if item.producer == "skill-catalog"
    ]
    payloads = []
    visible_catalogs = [
        item for item in catalogs if item.sequence > source.controls.compacted_through
    ]
    if (visible_catalogs and visible_catalogs[-1].metadata["entries"] != entries) or (
        not visible_catalogs and (entries or catalogs)
    ):
        payloads.append(
            ContextInjectedPayload(
                content=render_catalog(entries),
                producer="skill-catalog",
                metadata={"entries": entries, "run_id": run_id},
            )
        )
    direct_messages = {
        message.message_id: message for message in source.reduced_session.user_messages
    }
    messages = tuple(
        direct_messages[message.message_id]
        for decision in source.run.decisions
        if decision.payload.kind == "enter" and decision.payload.step == source.run.step
        for message in decision.payload.messages
        if message.message_id in decision.payload.input_ids
    )
    invoked = {
        item.metadata["name"]
        for item in source.injected_context
        if item.producer == "skill-invocation"
        and item.metadata["run_id"] == run_id
        and item.metadata["step"] == source.run.step
    }
    available = {skill.name for skill in skills if skill.user_invocable}
    for message in messages:
        for match in SKILL_GESTURE.finditer(message.content):
            name = match[1]
            if name in invoked or name not in available:
                continue
            definition = await registry.get(
                scope, name, workspace_id=source.workspace.id, invocation="user"
            )
            invoked.add(name)
            payloads.append(
                ContextInjectedPayload(
                    content=render_skill(definition),
                    producer="skill-invocation",
                    metadata={
                        "name": definition.summary.name,
                        "source": definition.summary.source,
                        "content": definition.content,
                        "run_id": run_id,
                        "message_id": message.message_id,
                        "step": source.run.step,
                    },
                )
            )
    if payloads:
        scope.assert_active()
        scope.require(s.PROJECTIONS).commit(
            EventBatch(
                session_id=source.session.id,
                run_id=None,
                events=tuple(
                    ContextInjectedEvent(
                        session_id=source.session.id,
                        run_id=None,
                        event_type="context.injected",
                        payload=payload,
                        occurred_at=datetime.now(UTC),
                    )
                    for payload in payloads
                ),
            )
        )
