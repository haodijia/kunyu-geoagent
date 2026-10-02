"""Default loop implementation behind the public Agent service."""

import asyncio
from builtins import BaseExceptionGroup
from uuid import uuid4

from kunyu.agent import services as s
from kunyu.agent.adapters import ServiceConfirmationRequester
from kunyu.agent.context import ScopedAgentContextProvider
from kunyu.agent.kernel import install_plugin
from kunyu.agent.runtime.runner import Runner
from kunyu.agent.runtime.runner_types import RunnerConflictError, RunnerNotFoundError
from kunyu.agent.scheduler import RunScheduler
from kunyu.agent.scope import Context
from kunyu.agent.session_agent import AgentDirectory


class RunnerPlugin:
    name = "run-driver"
    requires = (
        s.RUN_ID,
        s.EXECUTIONS,
        s.EVENTS,
        s.CONTEXTS,
        s.PROMPTS,
        s.CONTEXT_PREPARERS,
        s.MODEL,
        s.TOOLS,
        s.POLICY,
        s.CONFIRMATIONS,
    )
    provides = (s.RUNNER,)

    async def apply(self, context: Context) -> None:
        context.provide(
            s.RUNNER,
            Runner(
                context.require(s.EXECUTIONS),
                context.require(s.EVENTS),
                ScopedAgentContextProvider(
                    context.require(s.CONTEXTS),
                    context.require(s.PROMPTS),
                    context,
                    context.require(s.CONTEXT_PREPARERS),
                ),
                context.require(s.MODEL),
                context.require(s.TOOLS),
                context.require(s.POLICY),
                ServiceConfirmationRequester(context.require(s.CONFIRMATIONS)),
                message_id_factory=lambda: f"msg_{uuid4().hex}",
                tool_call_id_factory=lambda: f"tlc_{uuid4().hex}",
                operation_id_factory=lambda: f"op_{uuid4().hex}",
            ),
        )


class ScopedRuntime:
    def __init__(self, context: Context) -> None:
        self._context = context
        self._active: dict[str, asyncio.Task] = {}

    async def run(self, run_id: str) -> None:
        if run_id in self._active:
            raise RunnerConflictError(f"Run '{run_id}' is already executing.")
        task = asyncio.current_task()
        if task is None:
            raise RuntimeError("Agent execution requires an asyncio task.")
        self._active[run_id] = task
        try:
            execution = await self._context.require(s.EXECUTIONS).get(run_id)
            if execution is None:
                raise RunnerNotFoundError(run_id)
            agent = self._context.require(s.AGENTS).for_session(
                execution.run.session_id
            )
            scope = agent.ctx.child()
            scope.provide(s.RUN_ID, run_id)
            scope.effect(lambda: self.cancel(run_id), before_children=True)
            try:
                await install_plugin(scope, RunnerPlugin(), lifetime=scope)
                await scope.require(s.RUNNER).run(run_id)
            finally:
                self._active.pop(run_id)
                if not scope.disposing:
                    await scope.close()
        finally:
            self._active.pop(run_id, None)

    async def cancel(self, run_id: str) -> None:
        task = self._active.get(run_id)
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def shutdown(self) -> None:
        tasks = tuple(self._active.values())
        for task in tasks:
            task.cancel()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        failures = [
            result
            for result in results
            if isinstance(result, BaseException)
            and not isinstance(result, asyncio.CancelledError)
        ]
        if failures:
            raise BaseExceptionGroup("Agent loop shutdown failed.", failures)


class AgentLoopPlugin:
    name = "agent-loop"
    requires = (
        s.SCOPES,
        s.PROJECTIONS,
        s.EXECUTIONS,
        s.EVENTS,
        s.CONTEXTS,
        s.PROMPTS,
        s.CONTEXT_PREPARERS,
        s.MODEL,
        s.TOOLS,
        s.POLICY,
        s.CONFIRMATIONS,
        s.ACCEPTANCE,
        s.LIFECYCLE,
        s.LIFECYCLE_REPOSITORY,
    )
    provides = (s.RUNTIME, s.SCHEDULER, s.AGENTS)

    async def apply(self, context: Context) -> None:
        runtime = ScopedRuntime(context)
        scheduler = RunScheduler(
            runtime,
            context.require(s.LIFECYCLE),
            context.require(s.LIFECYCLE_REPOSITORY),
            context.require(s.CONFIRMATIONS),
            context.require(s.ACCEPTANCE),
        )
        context.provide(s.RUNTIME, runtime)
        context.provide(s.SCHEDULER, scheduler)
        context.provide(s.AGENTS, AgentDirectory(context))
        context.effect(runtime.shutdown, before_children=True)
        context.effect(scheduler.shutdown, before_children=True)
        # Process shutdown must drain execution before disposing Agent scopes.
        if context.parent is None:
            raise RuntimeError("The loop must be installed through a plugin owner.")
        detach = context.parent.effect(scheduler.shutdown, before_children=True)
        context.effect(detach)
        await scheduler.start()
