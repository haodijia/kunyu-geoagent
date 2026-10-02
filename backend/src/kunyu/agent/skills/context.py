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
from kunyu.agent.tools.shared import load_source


async def prepare_skill_context(run_id: str, scope: Context) -> None:
    source = load_source(scope.require(s.CONTEXTS), run_id)
    registry = scope.require(s.SKILLS)
    skills = await registry.list(scope, workspace_id=source.workspace.id)
    entries = catalog_entries(tuple(skill for skill in skills if skill.model_invocable))
    catalogs = [
        item for item in source.injected_context if item.producer == "skill-catalog"
    ]
    payloads = []
    if (catalogs and catalogs[-1].metadata["entries"] != entries) or (
        not catalogs and entries
    ):
        payloads.append(
            ContextInjectedPayload(
                content=render_catalog(entries),
                producer="skill-catalog",
                metadata={"entries": entries, "run_id": run_id},
            )
        )
    for message in source.reduced_session.user_messages:
        if (
            message.run_id != run_id
            or message.discarded
            or (message.delivery == "steer" and message.applied_step is None)
        ):
            continue
        command = re.match(r"^/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s|$)", message.content)
        already_invoked = any(
            item.producer == "skill-invocation"
            and item.metadata.get("message_id") == message.message_id
            for item in source.injected_context
        )
        if (
            command
            and not already_invoked
            and any(
                skill.name == command[1] and skill.user_invocable for skill in skills
            )
        ):
            definition = await registry.get(
                scope, command[1], workspace_id=source.workspace.id, invocation="user"
            )
            payloads.append(
                ContextInjectedPayload(
                    content=render_skill(definition),
                    producer="skill-invocation",
                    metadata={
                        "name": definition.summary.name,
                        "source": definition.summary.source,
                        "run_id": run_id,
                        "message_id": message.message_id,
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
