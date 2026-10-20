"""Session-backed child conversations, message delivery and interruption."""

import asyncio
import json
import logging
from typing import TYPE_CHECKING

from kunyu.agent.orchestration.inbox import SessionInbox
from kunyu.agent.runtime.contracts.tools import ToolCall, ToolExecutionError
from kunyu.agent.runtime.events.base import TERMINAL_RUN_STATES, RunState
from kunyu.agent.runtime.subagents import ReducedSubagent
from kunyu.agent.tools.shared import load_source
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.execution.run_acceptance import ModelSelection, RunAcceptanceRequest
from kunyu.persistence.execution.runs import SQLAlchemyEventStore
from kunyu.persistence.execution.subagents import SQLAlchemySubagentRepository

if TYPE_CHECKING:
    from kunyu.agent.orchestration.scheduler import RunScheduler
    from kunyu.agent.runtime.execution.driver import AgentRuntime
    from kunyu.application.execution.run_lifecycle import RunLifecycleService

logger = logging.getLogger(__name__)


class SubagentManager:
    def __init__(
        self,
        repository: SQLAlchemySubagentRepository,
        contexts: RunContextRepository,
        events: SQLAlchemyEventStore,
    ):
        self.repository, self.contexts, self.events = repository, contexts, events
        self._bound = False
        self._closing = False
        self._cancelling: dict[str, asyncio.Task] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def bind(
        self,
        scheduler: "RunScheduler",
        runtime: "AgentRuntime",
        lifecycle: "RunLifecycleService",
    ) -> None:
        if self._bound:
            raise RuntimeError("Subagent runtime is already bound.")
        self.scheduler, self.runtime, self.lifecycle = scheduler, runtime, lifecycle
        self._bound = True

    async def start(self, call: ToolCall) -> str:
        source = load_source(self.contexts, call.run_id)
        return await self.scheduler.submit_child(
            lambda sequence: self.repository.create(call, source, sequence)
        )

    def require(self, child_id: str, parent_id: str) -> ReducedSubagent:
        owned = self.repository.get(child_id)
        if owned is None or owned[0] != parent_id:
            raise ToolExecutionError("The subagent does not belong to this parent.")
        return owned[1]

    def _source(self, session_id: str):
        state = self.repository.child_state(session_id)
        if not state.runs:
            raise ToolExecutionError("The agent has no model configuration.")
        return load_source(self.contexts, state.runs[-1].run_id)

    async def send_message(self, call: ToolCall, agent_id: str, message: str) -> str:
        sender = load_source(self.contexts, call.run_id).session.id
        child = self.repository.get(agent_id)
        own = self.repository.get(sender)
        if child is not None and child[0] == sender:
            model = child[1].created.model_snapshot
            workspace_id = load_source(self.contexts, call.run_id).workspace.id
        elif own is not None and own[0] == agent_id:
            recipient = self._source(agent_id)
            model = recipient.run.request_snapshot or recipient.run.model_snapshot
            workspace_id = recipient.workspace.id
        else:
            raise ToolExecutionError("Messages require a direct parent or child.")
        async with self._locks.setdefault(agent_id, asyncio.Lock()):
            content = f"Message from agent {sender}:\n\n{message}"
            request = RunAcceptanceRequest(
                session_id=agent_id,
                idempotency_key=f"agent-message:{call.call_id}",
                normalized_body=json.dumps({"sender": sender, "content": content}),
                content=content,
                source="tool-subagents",
                model_selection=ModelSelection(
                    model.connection_id, model.model_id, model.reasoning_effort
                ),
                map_context={"workspace_id": workspace_id},
            )
            result = await self.scheduler.notify(request, lambda: not self._closing)
            if result is None:
                raise ToolExecutionError("The subagent service is shutting down.")
            return result.message.id

    def interrupt(self, child_id: str, parent_id: str) -> None:
        self.require(child_id, parent_id)
        if child_id not in self._cancelling:
            self._start_cancel(child_id)

    def _start_cancel(self, child_id: str) -> asyncio.Task:
        task = asyncio.create_task(self._cancel(child_id))
        self._cancelling[child_id] = task
        task.add_done_callback(
            lambda finished: self._cancel_finished(child_id, finished)
        )
        return task

    async def cancel(self, child_id: str, parent_id: str) -> ReducedSubagent:
        self.require(child_id, parent_id)
        task = self._cancelling.get(child_id)
        if task is None:
            task = self._start_cancel(child_id)
        return await asyncio.shield(task)

    def _cancel_finished(self, child_id: str, task: asyncio.Task) -> None:
        self._cancelling.pop(child_id, None)
        if not task.cancelled() and (error := task.exception()) is not None:
            logger.error(
                "Subagent %s interruption failed.",
                child_id,
                exc_info=(type(error), error, error.__traceback__),
            )

    async def _cancel(self, child_id: str) -> ReducedSubagent:
        async with self._locks.setdefault(child_id, asyncio.Lock()):
            state = self.repository.child_state(child_id)
            active = next(
                (
                    run
                    for run in reversed(state.runs)
                    if run.state not in TERMINAL_RUN_STATES
                ),
                None,
            )
            queued = state.next_turn[0] if state.next_turn else None
            if active is not None:
                if self.scheduler.closing_event.is_set():
                    await self.runtime.cancel(active.run_id)
                    await self.lifecycle.discard_inputs(active.run_id)
                    await self.lifecycle.cancel(active.run_id)
                else:
                    await self.scheduler.cancel(active.run_id)
                child = self.repository.settle(child_id, active.run_id)
            elif queued is not None:
                pending = state.next_turn
                await SessionInbox(child_id, self.events).clear_next_turn()
                for item in pending:
                    child = self.repository.settle(child_id, item.turn.run_id)
                    await self._deliver(child)
            else:
                child = self.repository.get(child_id)[1]
            if child.settled is not None:
                await self._deliver(child)
            return child

    async def after_run(self, run_id: str) -> None:
        owned = self.repository.for_run(run_id)
        if owned is None or owned[1].created.child_session_id in self._cancelling:
            return
        state = self.repository.child_state(owned[1].created.child_session_id)
        run = next(run for run in state.runs if run.run_id == run_id)
        if run.state is RunState.INTERRUPTED:
            # A child stop ends this activation; a later message starts another turn.
            await self.lifecycle.cancel(run_id)
            run = next(
                run
                for run in self.repository.child_state(state.session_id).runs
                if run.run_id == run_id
            )
        if run.state in TERMINAL_RUN_STATES:
            child = self.repository.settle(state.session_id, run_id)
            await self._deliver(child)

    async def _deliver(self, child: ReducedSubagent) -> None:
        if self._closing or self.scheduler.closing_event.is_set():
            return
        settled = child.settled
        if settled is None:
            raise RuntimeError("Only a settled activation can report its result.")
        parent_id = self.repository.get(child.created.child_session_id)[0]
        source = self._source(parent_id)
        model = source.run.request_snapshot or source.run.model_snapshot
        content = (
            f"Subagent {child.created.child_session_id} ({child.created.description}) "
            f"finished with status {settled.status}."
        )
        if settled.reason:
            content += f"\nReason: {settled.reason}"
        if len(settled.output) <= 24_000:
            content += "\n\n" + settled.output
        else:
            path = self.repository.report(child, source.workspace.id)
            content += f"\nThe full report is too long to include inline. Read it with read(file_path={path!r})."
        await self.scheduler.notify(
            RunAcceptanceRequest(
                session_id=parent_id,
                idempotency_key=f"subagent-result:{settled.child_run_id}",
                normalized_body=json.dumps(
                    {"source": "tool-subagents", "content": content}
                ),
                content=content,
                source="tool-subagents",
                model_selection=ModelSelection(
                    model.connection_id, model.model_id, model.reasoning_effort
                ),
                map_context={"workspace_id": source.workspace.id},
            ),
            lambda: not self._closing,
        )

    async def recover(self) -> None:
        for parent_id, child in self.repository.list():
            state = self.repository.child_state(child.created.child_session_id)
            for run in state.runs:
                if run.state in TERMINAL_RUN_STATES:
                    await self._deliver(
                        self.repository.settle(state.session_id, run.run_id)
                    )
            if state.next_turn or any(
                run.state not in TERMINAL_RUN_STATES for run in state.runs
            ):
                await self.cancel(state.session_id, parent_id)

    async def close(self) -> None:
        self._closing = True
        tasks = set(self._cancelling.values())
        if self._bound:
            for _, child in self.repository.list():
                child_id = child.created.child_session_id
                task = self._cancelling.get(child_id)
                tasks.add(task if task is not None else self._start_cancel(child_id))
        results = await asyncio.gather(*tasks, return_exceptions=True)
        failures = [result for result in results if isinstance(result, BaseException)]
        if failures:
            raise BaseExceptionGroup("Subagent shutdown failed.", failures)
