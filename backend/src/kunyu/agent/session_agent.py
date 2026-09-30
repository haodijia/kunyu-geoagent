"""Long-lived Session Agent facade over durable turn execution."""

import asyncio
from datetime import UTC, datetime

from dsh.events import (
    TERMINAL_RUN_STATES,
    ContextInjectedEvent,
    ContextInjectedPayload,
    EventBatch,
    RunState,
)
from kunyu.agent.scheduler import RunScheduler
from kunyu.application.run_lifecycle import RunLifecycleService
from kunyu.domain.run_acceptance import RunAcceptanceRequest, RunAcceptanceResult
from kunyu.domain.runs import RunDetails
from kunyu.persistence.agent_projections import SQLAlchemyAgentProjectionService
from kunyu.persistence.database import Database


class SessionAgent:
    def __init__(
        self,
        session_id: str,
        scheduler: RunScheduler,
        lifecycle: RunLifecycleService,
        projections: SQLAlchemyAgentProjectionService,
    ) -> None:
        self.session_id = session_id
        self._scheduler = scheduler
        self._lifecycle = lifecycle
        self._projections = projections

    async def followup(self, request: RunAcceptanceRequest) -> RunAcceptanceResult:
        self._require_request(request)
        return await self._scheduler.accept(request)

    async def steer(self, request: RunAcceptanceRequest) -> RunAcceptanceResult:
        self._require_request(request)
        return await self._scheduler.steer(request)

    def inject(self, content: str):
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
        if request.session_id != self.session_id:
            raise ValueError("Agent request belongs to another session.")


class SessionAgentIdleError(RuntimeError):
    def __init__(self, session_id: str) -> None:
        super().__init__(f"Session Agent '{session_id}' has no active turn.")


class AgentDirectory:
    def __init__(
        self,
        scheduler: RunScheduler,
        lifecycle: RunLifecycleService,
        database: Database,
    ) -> None:
        self._scheduler = scheduler
        self._lifecycle = lifecycle
        self._projections = SQLAlchemyAgentProjectionService(database)
        self._agents: dict[str, SessionAgent] = {}

    def for_session(self, session_id: str) -> SessionAgent:
        agent = self._agents.get(session_id)
        if agent is None:
            agent = SessionAgent(
                session_id,
                self._scheduler,
                self._lifecycle,
                self._projections,
            )
            self._agents[session_id] = agent
        return agent
