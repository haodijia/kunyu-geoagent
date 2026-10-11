"""Compose supported permissions, delegation and opt-in context contributors."""

from collections.abc import Callable
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import yaml
from pydantic import BaseModel, ConfigDict, Field

from kunyu.agent import services as s
from kunyu.agent.project_instructions import (
    clear_project_instructions,
    project_instruction_payload,
)
from kunyu.agent.prompt_files import read_prompt
from kunyu.agent.runtime.events import ContextInjectedEvent, EventBatch
from kunyu.agent.runtime_context import runtime_payload, time_payload
from kunyu.agent.scope import Context
from kunyu.agent.tools.shared import load_source


class RuntimeContextSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    time_enabled: bool
    time_zone: str
    time_refresh_seconds: int = Field(ge=0)
    project_instructions_enabled: bool


def utc_now() -> datetime:
    return datetime.now(UTC)


class RuntimeContextPlugin:
    name = "runtime-context"
    requires = (
        s.CONTEXT_PREPARERS,
        s.CONTEXTS,
        s.PROJECTIONS,
        s.SUBAGENTS,
        s.FILESYSTEM,
    )
    provides = ()

    def __init__(self, *, clock: Callable[[], datetime] = utc_now) -> None:
        self.clock = clock

    async def apply(self, context: Context) -> None:
        settings = RuntimeContextSettings.model_validate(
            yaml.safe_load(read_prompt("context-settings.yaml"))
        )
        zone = ZoneInfo(settings.time_zone)

        async def prepare(run_id: str, scope: Context) -> None:
            source = load_source(scope.require(s.CONTEXTS), run_id)
            payloads = []
            if settings.project_instructions_enabled:
                project = await project_instruction_payload(
                    source, scope.require(s.FILESYSTEM)
                )
                source = load_source(scope.require(s.CONTEXTS), run_id)
            else:
                project = clear_project_instructions(source)
            if project is not None:
                payloads.append(project)
            runtime = runtime_payload(
                source,
                child=scope.require(s.SUBAGENTS).repository.is_child(source.session.id),
            )
            if runtime is not None:
                payloads.append(runtime)
            now = self.clock()
            if settings.time_enabled:
                time = time_payload(source, now, zone, settings.time_refresh_seconds)
                if time is not None:
                    payloads.append(time)
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
                                occurred_at=now,
                            )
                            for payload in payloads
                        ),
                    )
                )

        context.require(s.CONTEXT_PREPARERS).register(
            context, "runtime-context", prepare
        )
