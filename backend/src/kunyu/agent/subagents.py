"""One-shot child supervision over the shared Agent runtime."""

import asyncio
import logging
from typing import TYPE_CHECKING

from kunyu.agent.inbox import SessionInbox
from kunyu.agent.runtime.events import TERMINAL_RUN_STATES, RunState
from kunyu.agent.runtime.subagents import ReducedSubagent
from kunyu.agent.runtime.tools import ToolCall, ToolExecutionError
from kunyu.agent.tools.shared import load_source
from kunyu.domain.agent_context import RunContextRepository
from kunyu.persistence.runs import SQLAlchemyEventStore
from kunyu.persistence.subagents import SQLAlchemySubagentRepository

if TYPE_CHECKING:
    from kunyu.agent.runtime.driver import AgentRuntime
    from kunyu.agent.scheduler import RunScheduler
    from kunyu.application.run_lifecycle import RunLifecycleService

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
        self._cancelling: dict[str, asyncio.Task] = {}

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

    def require(
        self, child_id: str, parent_id: str, owner_run_id: str | None = None
    ) -> ReducedSubagent:
        owned = self.repository.get(child_id)
        if (
            owned is None
            or owned[0] != parent_id
            or (
                owner_run_id is not None
                and owned[1].created.owner_run_id != owner_run_id
            )
        ):
            raise ToolExecutionError("The subagent does not belong to this parent.")
        return owned[1]

    async def wait(
        self,
        parent_id: str,
        children: tuple[str, ...],
        *,
        owner_run_id: str,
        timeout: float | None,
    ) -> tuple[ReducedSubagent, ...]:
        changed = asyncio.Event()
        watched = {parent_id, *children}
        unsubscribe = self.repository.database.publications.subscribe(
            lambda publication: (
                changed.set() if publication.after.session_id in watched else None
            )
        )
        loop = asyncio.get_running_loop()
        deadline = None if timeout is None else loop.time() + timeout
        try:
            while True:
                changed.clear()
                results = tuple(
                    self.require(child, parent_id, owner_run_id) for child in children
                )
                if all(child.settled is not None for child in results):
                    return results
                remaining = None if deadline is None else deadline - loop.time()
                if remaining is not None and remaining <= 0:
                    return results
                try:
                    await asyncio.wait_for(changed.wait(), remaining)
                except TimeoutError:
                    return tuple(
                        self.require(child, parent_id, owner_run_id)
                        for child in children
                    )
        finally:
            unsubscribe()

    async def cancel(
        self, child_id: str, parent_id: str, owner_run_id: str | None = None
    ) -> ReducedSubagent:
        child = self.require(child_id, parent_id, owner_run_id)
        if child.settled is not None:
            return child
        active = self._cancelling.get(child_id)
        if active is not None:
            return await asyncio.shield(active)
        task = asyncio.create_task(self._cancel(child_id))
        self._cancelling[child_id] = task
        task.add_done_callback(
            lambda finished: self._cancel_finished(child_id, finished)
        )
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            await asyncio.shield(task)
            raise

    def _cancel_finished(self, child_id: str, task: asyncio.Task) -> None:
        self._cancelling.pop(child_id, None)
        if not task.cancelled() and (error := task.exception()) is not None:
            logger.error(
                "Subagent %s cancellation failed.",
                child_id,
                exc_info=(type(error), error, error.__traceback__),
            )

    async def close(self) -> None:
        results = await asyncio.gather(
            *tuple(self._cancelling.values()), return_exceptions=True
        )
        failures = [result for result in results if isinstance(result, BaseException)]
        if failures:
            raise BaseExceptionGroup("Subagent cancellation cleanup failed.", failures)
        if self._bound:
            await self.recover()

    async def _cancel(self, child_id: str) -> ReducedSubagent:
        child = self.repository.get(child_id)[1]
        run_id = child.created.child_run_id
        await self.runtime.cancel(run_id)
        state = self.repository.child_state(child_id)
        run = next((run for run in state.runs if run.run_id == run_id), None)
        if run is None:
            await SessionInbox(child_id, self.events).clear_next_turn()
        elif run.state not in TERMINAL_RUN_STATES:
            await self.lifecycle.discard_inputs(run_id)
            await self.lifecycle.cancel(run_id)
        return self.repository.settle(child_id)

    async def after_run(self, run_id: str) -> None:
        owned = self.repository.for_run(run_id)
        if (
            owned is not None
            and owned[1].settled is None
            and owned[1].created.child_session_id not in self._cancelling
        ):
            state = self.repository.child_state(owned[1].created.child_session_id)
            run = next(run for run in state.runs if run.run_id == run_id)
            if run.state in TERMINAL_RUN_STATES or run.state is RunState.INTERRUPTED:
                self.repository.settle(owned[1].created.child_session_id)
        source = self.contexts.get(run_id)
        if source is None:
            return
        if (
            source.run.state not in TERMINAL_RUN_STATES
            and source.run.state is not RunState.INTERRUPTED
        ):
            return
        for parent_id, child in self.repository.list(source.session.id):
            if child.created.owner_run_id == run_id and child.settled is None:
                await self.cancel(child.created.child_session_id, parent_id, run_id)

    async def recover(self) -> None:
        for parent_id, child in self.repository.list():
            if child.settled is None:
                state = self.repository.child_state(child.created.child_session_id)
                run = next(
                    (
                        run
                        for run in state.runs
                        if run.run_id == child.created.child_run_id
                    ),
                    None,
                )
                if run is not None and run.state in TERMINAL_RUN_STATES:
                    self.repository.settle(child.created.child_session_id)
                else:
                    await self.cancel(child.created.child_session_id, parent_id)
