"""Scope-owned middleware and notifications fused to the actual Session Agent."""

import asyncio
import inspect
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

from kunyu.agent.runtime.events import ModelSnapshotPayload
from kunyu.agent.runtime.hooks import (
    CancellationSignal,
    EnterStep,
    RequestErrorAction,
    RequestFailure,
    StepDecision,
    StepProposal,
)
from kunyu.agent.runtime.run_state import ReducedRun
from kunyu.agent.scope import Context, ScopedEntries

if TYPE_CHECKING:
    from kunyu.agent.session_agent import SessionAgent

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class AgentHookInvocation:
    agent: "SessionAgent"
    run: ReducedRun
    signal: CancellationSignal


@dataclass(frozen=True, slots=True)
class PreStepInvocation(AgentHookInvocation):
    proposal: StepProposal


@dataclass(frozen=True, slots=True)
class RequestErrorInvocation(AgentHookInvocation):
    failure: RequestFailure


type Middleware[InputT, ResultT] = Callable[
    [InputT, Callable[[], Awaitable[ResultT]]], Awaitable[ResultT]
]


class ErrorObserverRegistry:
    def __init__(self) -> None:
        self._entries: ScopedEntries[
            tuple[Context, Callable[[AgentHookInvocation, BaseException], object]]
        ] = ScopedEntries()

    def register(
        self,
        owner: Context,
        name: str,
        handler: Callable[[AgentHookInvocation, BaseException], object],
    ) -> None:
        self._entries.register(owner, name, (owner, handler))

    def view(
        self, scope: Context
    ) -> dict[
        str, tuple[Context, Callable[[AgentHookInvocation, BaseException], object]]
    ]:
        return self._entries.view(scope)


class AgentHookRegistry:
    def __init__(self) -> None:
        self.pre_step: ScopedEntries[Middleware[PreStepInvocation, StepDecision]] = (
            ScopedEntries()
        )
        self.request: ScopedEntries[
            Middleware[AgentHookInvocation, ModelSnapshotPayload]
        ] = ScopedEntries()
        self.request_error: ScopedEntries[
            Middleware[RequestErrorInvocation, RequestErrorAction]
        ] = ScopedEntries()
        self.turn_stopping: ScopedEntries[
            Callable[[AgentHookInvocation], Awaitable[None]]
        ] = ScopedEntries()
        self.errors = ErrorObserverRegistry()

    def bind(self, agent: "SessionAgent", scope: Context) -> "AgentHookDispatch":
        if scope.scope != agent.ctx.scope:
            raise ValueError("Hook dispatch must use its Agent's scope carrier.")
        return AgentHookDispatch(self, agent, scope)


async def _waterfall[InputT, ResultT](
    handlers: tuple[Middleware[InputT, ResultT], ...],
    invocation: InputT,
    default: Callable[[], Awaitable[ResultT]],
) -> ResultT:
    async def invoke(index: int) -> ResultT:
        if index == len(handlers):
            return await default()
        called = False

        async def next_handler() -> ResultT:
            nonlocal called
            if called:
                raise RuntimeError("A hook may call next() only once.")
            called = True
            return await invoke(index + 1)

        return await handlers[index](invocation, next_handler)

    return await invoke(0)


class AgentHookDispatch:
    def __init__(
        self, registry: AgentHookRegistry, agent: "SessionAgent", scope: Context
    ) -> None:
        self._registry, self._agent, self._scope = registry, agent, scope

    def _invocation(
        self, run: ReducedRun, signal: CancellationSignal
    ) -> AgentHookInvocation:
        self._scope.assert_active()
        if run.session_id != self._agent.session_id:
            raise ValueError("Hook invocation belongs to another Agent.")
        signal.throw_if_cancelled()
        return AgentHookInvocation(self._agent, run, signal)

    async def pre_step(self, proposal: StepProposal) -> StepDecision:
        base = self._invocation(proposal.run, proposal.signal)
        invocation = PreStepInvocation(base.agent, base.run, base.signal, proposal)

        async def default() -> StepDecision:
            return EnterStep(proposal.messages)

        result = await _waterfall(
            tuple(self._registry.pre_step.view(self._scope).values()),
            invocation,
            default,
        )
        proposal.signal.throw_if_cancelled()
        return result

    async def request(
        self, run: ReducedRun, seed: ModelSnapshotPayload, signal: CancellationSignal
    ) -> ModelSnapshotPayload:
        invocation = self._invocation(run, signal)

        async def default() -> ModelSnapshotPayload:
            return seed

        result = await _waterfall(
            tuple(self._registry.request.view(self._scope).values()),
            invocation,
            default,
        )
        signal.throw_if_cancelled()
        return ModelSnapshotPayload.model_validate(result.model_dump())

    async def request_error(
        self, run: ReducedRun, failure: RequestFailure, signal: CancellationSignal
    ) -> RequestErrorAction:
        base = self._invocation(run, signal)
        invocation = RequestErrorInvocation(base.agent, base.run, base.signal, failure)

        async def default() -> RequestErrorAction:
            return None

        result = await _waterfall(
            tuple(self._registry.request_error.view(self._scope).values()),
            invocation,
            default,
        )
        signal.throw_if_cancelled()
        if result not in {None, "retry"}:
            raise ValueError("Request-error hooks may delegate or request a retry.")
        return result

    async def turn_stopping(self, run: ReducedRun, signal: CancellationSignal) -> None:
        invocation = self._invocation(run, signal)
        for handler in self._registry.turn_stopping.view(self._scope).values():
            await handler(invocation)
            signal.throw_if_cancelled()
            self._scope.assert_active()

    def error(self, run: ReducedRun, error: BaseException) -> None:
        task = asyncio.current_task()
        if task is None:
            raise RuntimeError("Agent notifications require the loop task.")
        invocation = AgentHookInvocation(self._agent, run, CancellationSignal(task))
        try:
            observers = self._registry.errors.view(self._scope).values()
        except Exception:
            logger.exception(
                "Agent error notification scope is unavailable for %s.", run.run_id
            )
            return
        for owner, handler in observers:
            try:
                owner.assert_active()
                returned = handler(invocation, error)
                if inspect.isawaitable(returned):
                    notification = asyncio.create_task(self._observe(returned))

                    async def drain(task=notification):
                        task.cancel()
                        await asyncio.gather(task, return_exceptions=True)

                    detach = owner.effect(drain)
                    notification.add_done_callback(lambda _, detach=detach: detach())
            except BaseException:
                logger.exception("Agent error notification failed for %s.", run.run_id)

    async def _observe(self, awaitable: Awaitable[object]) -> None:
        try:
            await awaitable
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "Agent error notification rejected for %s.", self._agent.session_id
            )
