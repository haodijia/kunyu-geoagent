"""Plugin-owned scoped human commands; execution never implies a model prompt."""

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from kunyu.agent import services as s
from kunyu.agent.runtime.events import (
    CommandDoneEvent,
    CommandDonePayload,
    CommandRunEvent,
    CommandRunPayload,
    EventBatch,
)
from kunyu.agent.scope import Context, ScopedEntries
from kunyu.agent.session_agent import SessionAgent
from kunyu.domain.run_acceptance import RunAcceptanceRequest

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class CommandResult:
    kind: Literal["success", "error"]
    text: str
    source_event_sequence: int | None = None


@dataclass(frozen=True, slots=True)
class CommandInvocation:
    agent: SessionAgent
    command_id: str
    raw_input: str
    message: RunAcceptanceRequest | None


@dataclass(frozen=True, slots=True)
class CommandDefinition:
    definition_id: str
    name: str
    description: str
    handler: Callable[[CommandInvocation], Awaitable[CommandResult]]
    input_hint: str | None = None
    record_input: bool = True


class CommandRegistry:
    def __init__(self) -> None:
        self._entries: ScopedEntries[CommandDefinition] = ScopedEntries()
        self._locks: dict[str, asyncio.Lock] = {}

    def register(self, owner: Context, definition: CommandDefinition) -> None:
        if re.fullmatch(r"[a-z][a-z0-9_-]*", definition.name) is None:
            raise ValueError("Invalid command name.")
        self._entries.register(owner, definition.name, definition)

    def list(self, agent: SessionAgent) -> tuple[CommandDefinition, ...]:
        return tuple(
            sorted(self._entries.view(agent.ctx).values(), key=lambda item: item.name)
        )

    async def execute(
        self,
        agent: SessionAgent,
        command_id: str,
        line: str,
        message: RunAcceptanceRequest | None,
    ) -> CommandResult:
        parsed = re.fullmatch(r"\s*/([a-z][a-z0-9_-]*)(\s[\s\S]*)?", line)
        if parsed is None:
            raise ValueError("Invalid slash command.")
        definition = self._entries.view(agent.ctx).get(parsed[1])
        if definition is None:
            raise ValueError("This command is not installed for the session.")
        raw_input = "" if parsed[2] is None else parsed[2]
        if agent.session_id not in self._locks:
            self._locks[agent.session_id] = asyncio.Lock()
            agent.ctx.effect(lambda: self._locks.pop(agent.session_id))
        async with self._locks[agent.session_id]:
            events = await agent.ctx.require(s.EVENTS).list_after(agent.session_id, 0)
            previous = next(
                (
                    event
                    for event in events
                    if event.event_type == "command/run"
                    and event.payload["command_id"] == command_id
                ),
                None,
            )
            if previous is not None:
                if (
                    previous.payload["definition_id"] != definition.definition_id
                    or previous.payload["name"] != definition.name
                    or (
                        definition.record_input
                        and previous.payload["raw_input"] != raw_input
                    )
                ):
                    raise ValueError(
                        "Command identity was reused for a different invocation."
                    )
                done = next(
                    (
                        event
                        for event in events
                        if event.event_type == "command/done"
                        and event.payload["command_id"] == command_id
                    ),
                    None,
                )
                if done is None:
                    result = CommandResult(
                        "error", "上次命令执行已中断，请检查会话状态后重新提交。"
                    )
                    self._done(agent, command_id, result)
                    return result
                payload = CommandDonePayload.model_validate(done.payload)
                return CommandResult(
                    payload.kind, payload.text, payload.source_event_sequence
                )
            self._append(
                agent,
                CommandRunEvent(
                    session_id=agent.session_id,
                    event_type="command/run",
                    occurred_at=datetime.now(UTC),
                    payload=CommandRunPayload(
                        command_id=command_id,
                        definition_id=definition.definition_id,
                        name=definition.name,
                        raw_input=raw_input if definition.record_input else None,
                    ),
                ),
            )
            try:
                result = await definition.handler(
                    CommandInvocation(agent, command_id, raw_input, message)
                )
            except asyncio.CancelledError:
                self._done(
                    agent, command_id, CommandResult("error", "命令执行已取消。")
                )
                raise
            except Exception:
                logger.exception(
                    "Command %s failed for session %s",
                    definition.name,
                    agent.session_id,
                )
                result = CommandResult(
                    "error", "命令执行失败，详情已记录在服务日志中。"
                )
            self._done(agent, command_id, result)
            return result

    def _done(
        self, agent: SessionAgent, command_id: str, result: CommandResult
    ) -> None:
        self._append(
            agent,
            CommandDoneEvent(
                session_id=agent.session_id,
                event_type="command/done",
                occurred_at=datetime.now(UTC),
                payload=CommandDonePayload(
                    command_id=command_id,
                    kind=result.kind,
                    text=result.text,
                    source_event_sequence=result.source_event_sequence,
                ),
            ),
        )

    @staticmethod
    def _append(agent: SessionAgent, event: CommandRunEvent | CommandDoneEvent) -> None:
        agent.ctx.require(s.PROJECTIONS).commit(
            EventBatch(agent.session_id, None, (event,))
        )
