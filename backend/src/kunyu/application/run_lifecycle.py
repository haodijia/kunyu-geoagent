from collections.abc import Callable
from datetime import UTC, datetime

from kunyu.agent.inbox import SessionInbox
from kunyu.agent.runtime.events import (
    TERMINAL_RUN_STATES,
    BudgetSettledEvent,
    BudgetSettledPayload,
    EventBatch,
    EventDraft,
    QuestionResolvedEvent,
    QuestionResolvedPayload,
    RunProgressEvent,
    RunProgressPayload,
    RunState,
    RunTerminalEvent,
    RunTerminalPayload,
    ToolProgressEvent,
    ToolProgressPayload,
)
from kunyu.agent.runtime.runner_types import budget_usage, current_tool_batch
from kunyu.application.sessions import SessionNotFoundError
from kunyu.domain.runs import RunDetails
from kunyu.persistence.run_lifecycle import SQLAlchemyRunLifecycleRepository
from kunyu.persistence.runs import SQLAlchemyEventStore


class RunLifecycleNotFoundError(LookupError):
    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        super().__init__(f"Run '{run_id}' was not found.")


class RunLifecycleConflictError(RuntimeError):
    pass


class ModelConnectionInUseError(RuntimeError):
    def __init__(self, connection_id: str) -> None:
        self.connection_id = connection_id
        super().__init__(
            f"Model connection '{connection_id}' is referenced by an unfinished run."
        )


class RunLifecycleService:
    def __init__(
        self,
        repository: SQLAlchemyRunLifecycleRepository,
        events: SQLAlchemyEventStore,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._events = events
        self._clock = clock or _utc_now

    def get_details(self, run_id: str) -> RunDetails:
        details = self._repository.get_details(run_id)
        if details is None:
            raise RunLifecycleNotFoundError(run_id)
        return details

    async def discard_inputs(self, run_id: str) -> None:
        run = self._require_reduced(run_id)
        await SessionInbox(run.session_id, self._events).discard(run_id)

    def list_for_session(self, session_id: str) -> tuple[RunDetails, ...]:
        details = self._repository.list_details_for_session(session_id)
        if details is None:
            raise SessionNotFoundError(session_id)
        return details

    async def recover_startup(self) -> None:
        for run in self._repository.list_startup_candidates():
            events: list[EventDraft] = []
            now = self._clock()
            if run.state in {RunState.MODEL_RUNNING, RunState.TOOL_RUNNING}:
                events.extend(
                    self._interruption_events(
                        run,
                        "Backend restart interrupted active execution.",
                        now,
                    )
                )
            elif run.state is RunState.READY and not run.requires_resume:
                events.append(
                    self._progress_event(
                        run,
                        "run.recovery_required",
                        requires_resume=True,
                        queue_sequence=None,
                        reason="Backend restart requires explicit resume.",
                        occurred_at=now,
                    )
                )
            if events:
                await self._events.commit(
                    EventBatch(
                        session_id=run.session_id,
                        run_id=run.run_id,
                        events=tuple(events),
                    )
                )

    async def interrupt_if_active(self, run_id: str, reason: str) -> RunDetails:
        run = self._require_reduced(run_id)
        if run.state not in {RunState.MODEL_RUNNING, RunState.TOOL_RUNNING}:
            return self.get_details(run_id)
        await self._events.commit(
            EventBatch(
                session_id=run.session_id,
                run_id=run.run_id,
                events=self._interruption_events(run, reason, self._clock()),
            )
        )
        return self.get_details(run_id)

    async def queue(self, run_id: str, queue_sequence: int) -> RunDetails:
        run = self._require_reduced(run_id)
        if run.state is not RunState.READY or run.requires_resume:
            raise RunLifecycleConflictError(
                f"Run '{run_id}' is not at an executable ready boundary."
            )
        if run.queue_sequence is not None:
            return self.get_details(run_id)
        await self._events.commit(
            EventBatch(
                session_id=run.session_id,
                run_id=run.run_id,
                events=(
                    self._progress_event(
                        run,
                        "run.queued",
                        requires_resume=False,
                        queue_sequence=queue_sequence,
                        reason=None,
                        occurred_at=self._clock(),
                    ),
                ),
            )
        )
        return self.get_details(run_id)

    async def resume(self, run_id: str, queue_sequence: int) -> RunDetails:
        run = self._require_reduced(run_id)
        if run.state is RunState.INTERRUPTED:
            attempt = (
                run.attempt + 1 if run.resume_phase.value == "model" else run.attempt
            )
        elif run.state is RunState.READY and run.requires_resume:
            attempt = run.attempt
        else:
            raise RunLifecycleConflictError(
                f"Run '{run_id}' cannot be resumed from state '{run.state.value}'."
            )
        event = RunProgressEvent(
            session_id=run.session_id,
            run_id=run.run_id,
            event_type="run.resumed",
            payload=RunProgressPayload(
                step=run.step,
                attempt=attempt,
                resume_phase=run.resume_phase.value,
                next_tool_index=run.next_tool_index,
                requires_resume=False,
                queue_sequence=queue_sequence,
                reason=None,
                budget=budget_usage(run),
            ),
            occurred_at=self._clock(),
        )
        await self._events.commit(
            EventBatch(
                session_id=run.session_id,
                run_id=run.run_id,
                events=(event,),
            )
        )
        return self.get_details(run_id)

    async def cancel(self, run_id: str) -> RunDetails:
        run = self._require_reduced(run_id)
        if run.state in TERMINAL_RUN_STATES:
            return self.get_details(run_id)
        if run.state is RunState.WAITING_CONFIRMATION:
            raise RunLifecycleConflictError(
                "Waiting confirmations must be cancelled through their exact decision."
            )
        now = self._clock()
        events: list[EventDraft] = []
        if run.state is RunState.WAITING_INPUT:
            assert run.pending_question_id is not None
            events.append(
                QuestionResolvedEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="question.resolved",
                    payload=QuestionResolvedPayload(
                        question_id=run.pending_question_id,
                        decision="cancelled",
                        answer=None,
                    ),
                    occurred_at=now,
                )
            )
        events.append(
            RunTerminalEvent(
                session_id=run.session_id,
                run_id=run.run_id,
                event_type="run.cancelled",
                payload=RunTerminalPayload(
                    state="cancelled",
                    reason="Run cancelled by the user.",
                    budget=budget_usage(run),
                ),
                occurred_at=now,
            )
        )
        await self._events.commit(
            EventBatch(
                session_id=run.session_id,
                run_id=run.run_id,
                events=tuple(events),
            )
        )
        return self.get_details(run_id)

    def require_connection_available(self, connection_id: str) -> None:
        if self._repository.connection_has_unfinished_run(connection_id):
            raise ModelConnectionInUseError(connection_id)

    def _require_reduced(self, run_id: str):
        run = self._repository.get_reduced(run_id)
        if run is None:
            raise RunLifecycleNotFoundError(run_id)
        return run

    def _interruption_events(
        self,
        run,
        reason: str,
        occurred_at: datetime,
    ) -> tuple[EventDraft, ...]:
        events: list[EventDraft] = []
        reservation = self._repository.open_budget_reservation(run.run_id)
        if reservation is not None:
            events.append(
                BudgetSettledEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="run.budget_settled",
                    payload=BudgetSettledPayload(
                        operation_id=reservation.operation_id,
                        operation_type=reservation.operation_type,
                        operation_count=reservation.operation_count,
                        reserved_milliseconds=reservation.reserved_milliseconds,
                        actual_milliseconds=None,
                        charged_milliseconds=reservation.reserved_milliseconds,
                        crashed=True,
                    ),
                    occurred_at=occurred_at,
                )
            )
        if run.state is RunState.TOOL_RUNNING:
            calls = current_tool_batch(run)
            if run.next_tool_index < len(calls):
                tool = calls[run.next_tool_index]
                if tool.status == "running":
                    events.append(
                        ToolProgressEvent(
                            session_id=run.session_id,
                            run_id=run.run_id,
                            event_type="tool.cancelled",
                            payload=ToolProgressPayload(
                                tool_call_id=tool.tool_call_id,
                                provider_call_id=tool.provider_call_id,
                                message_id=tool.message_id,
                                batch_index=tool.batch_index,
                                next_tool_index=run.next_tool_index,
                            ),
                            occurred_at=occurred_at,
                        )
                    )
        events.append(
            self._progress_event(
                run,
                "run.interrupted",
                requires_resume=True,
                queue_sequence=None,
                reason=reason,
                occurred_at=occurred_at,
            )
        )
        return tuple(events)

    @staticmethod
    def _progress_event(
        run,
        event_type,
        *,
        requires_resume: bool,
        queue_sequence: int | None,
        reason: str | None,
        occurred_at: datetime,
    ) -> RunProgressEvent:
        return RunProgressEvent(
            session_id=run.session_id,
            run_id=run.run_id,
            event_type=event_type,
            payload=RunProgressPayload(
                step=run.step,
                attempt=run.attempt,
                resume_phase=run.resume_phase.value,
                next_tool_index=run.next_tool_index,
                requires_resume=requires_resume,
                queue_sequence=queue_sequence,
                reason=reason,
                budget=budget_usage(run),
            ),
            occurred_at=occurred_at,
        )


def _utc_now() -> datetime:
    return datetime.now(UTC)
