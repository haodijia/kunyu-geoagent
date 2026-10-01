"""Long-lived Session Agent facade over durable turn execution."""

import asyncio
from builtins import BaseExceptionGroup
from datetime import UTC, datetime

from kunyu.agent import services as s
from kunyu.agent.runtime.events import (
    TERMINAL_RUN_STATES,
    ContextInjectedEvent,
    ContextInjectedPayload,
    EventBatch,
    RunState,
)
from kunyu.agent.scheduler import RunScheduler
from kunyu.agent.scope import Context
from kunyu.application.run_lifecycle import RunLifecycleService
from kunyu.domain.run_acceptance import RunAcceptanceRequest, RunAcceptanceResult
from kunyu.domain.runs import RunDetails
from kunyu.persistence.agent_projections import SQLAlchemyAgentProjectionService


class SessionAgent:
    def __init__(
        self,
        session_id: str,
        scheduler: RunScheduler,
        lifecycle: RunLifecycleService,
        projections: SQLAlchemyAgentProjectionService,
        context: Context,
    ) -> None:
        self.session_id = session_id
        self._scheduler = scheduler
        self._lifecycle = lifecycle
        self._projections = projections
        self.ctx = context

    async def followup(self, request: RunAcceptanceRequest) -> RunAcceptanceResult:
        self._require_request(request)
        return await self._scheduler.accept(request)

    async def steer(self, request: RunAcceptanceRequest) -> RunAcceptanceResult:
        self._require_request(request)
        return await self._scheduler.steer(request)

    def inject(self, content: str):
        self.ctx.assert_active()
        return self._projections.commit(
            EventBatch(
                session_id=self.session_id,
                run_id=None,
                events=(
                    ContextInjectedEvent(
                        session_id=self.session_id,
                        run_id=None,
                        event_type="context.injected",
                        payload=ContextInjectedPayload(content=content),
                        occurred_at=datetime.now(UTC),
                    ),
                ),
            )
        )[0]

    def turns(self) -> tuple[RunDetails, ...]:
        self.ctx.assert_active()
        return self._lifecycle.list_for_session(self.session_id)

    async def cancel(self) -> RunDetails:
        return await self._scheduler.cancel(self._active_turn().run.id)

    async def resume(self) -> RunDetails:
        return await self._scheduler.resume(self._active_turn().run.id)

    async def when_idle(self) -> None:
        while True:
            active = self._find_active_turn()
            if active is None or active.run.state in {
                RunState.INTERRUPTED,
                RunState.WAITING_CONFIRMATION,
            }:
                return
            await asyncio.sleep(0.05)

    def _active_turn(self) -> RunDetails:
        active = self._find_active_turn()
        if active is None:
            raise SessionAgentIdleError(self.session_id)
        return active

    def _find_active_turn(self) -> RunDetails | None:
        return next(
            (
                turn
                for turn in reversed(self.turns())
                if turn.run.state not in TERMINAL_RUN_STATES
            ),
            None,
        )

    def _require_request(self, request: RunAcceptanceRequest) -> None:
        self.ctx.assert_active()
        if request.session_id != self.session_id:
            raise ValueError("Agent request belongs to another session.")


class SessionAgentIdleError(RuntimeError):
    def __init__(self, session_id: str) -> None:
        super().__init__(f"Session Agent '{session_id}' has no active turn.")


class AgentDirectory:
    def __init__(self, owner: Context) -> None:
        self._owner = owner
        self._agents: dict[str, SessionAgent] = {}
        owner.effect(self._close_scopes)

    async def _close_scopes(self) -> None:
        results = await asyncio.gather(
            *(agent.ctx.close() for agent in tuple(self._agents.values())),
            return_exceptions=True,
        )
        failures = [result for result in results if isinstance(result, BaseException)]
        if failures:
            raise BaseExceptionGroup("Agent directory disposal failed.", failures)

    def for_session(self, session_id: str) -> SessionAgent:
        self._owner.assert_active()
        agent = self._agents.get(session_id)
        if agent is None:
            context = self._owner.require(s.SCOPES).for_session(session_id)
            agent = SessionAgent(
                session_id,
                context.require(s.SCHEDULER),
                context.require(s.LIFECYCLE),
                context.require(s.PROJECTIONS),
                context,
            )
            context.provide(s.SESSION_ID, session_id)
            context.provide(s.SESSION_AGENT, agent)
            context.effect(lambda: self._agents.pop(session_id))
            scheduler = context.require(s.SCHEDULER)
            lifecycle = context.require(s.LIFECYCLE)
            runtime = context.require(s.RUNTIME)

            async def quiesce() -> None:
                if scheduler.closing_event.is_set():
                    return
                for turn in lifecycle.list_for_session(session_id):
                    if turn.run.state not in TERMINAL_RUN_STATES:
                        await runtime.cancel(turn.run.id)
                        await scheduler.cancel(turn.run.id)

            context.effect(quiesce, before_children=True)
            self._agents[session_id] = agent
        return agent

    async def dispose(self, session_id: str) -> None:
        await self.for_session(session_id).ctx.close()
