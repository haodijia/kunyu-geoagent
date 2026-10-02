"""Process-local FIFO scheduling around durable run boundaries."""

import asyncio
import logging
from typing import Literal

from kunyu.agent.inbox import InboxQueueConflictError, SessionInbox
from kunyu.agent.queue_interactions import QueueInteractionConfig, QueueInteractions
from kunyu.agent.runtime.driver import AgentRuntime
from kunyu.agent.runtime.events import (
    TERMINAL_RUN_STATES,
    InboxMessagePayload,
    RunState,
)
from kunyu.agent.scope import Context
from kunyu.application.confirmations import ConfirmationService
from kunyu.application.run_acceptance import RunAcceptanceService
from kunyu.application.run_lifecycle import (
    RunLifecycleConflictError,
    RunLifecycleService,
)
from kunyu.domain.confirmations import ConfirmationDecisionResult, ConfirmationStatus
from kunyu.domain.run_acceptance import RunAcceptanceRequest, RunAcceptanceResult
from kunyu.domain.runs import RunDetails
from kunyu.persistence.run_lifecycle import SQLAlchemyRunLifecycleRepository

MAX_CONCURRENT_RUNS = 4
MAX_QUEUED_RUNS = 32
SHUTDOWN_TIMEOUT_SECONDS = 3

logger = logging.getLogger(__name__)


class RunQueueFullError(RuntimeError):
    pass


class RunSchedulerClosingError(RuntimeError):
    pass


class RunScheduler:
    def __init__(
        self,
        runtime: AgentRuntime,
        lifecycle: RunLifecycleService,
        repository: SQLAlchemyRunLifecycleRepository,
        confirmations: ConfirmationService,
        acceptance: RunAcceptanceService,
        *,
        interaction_config: QueueInteractionConfig = QueueInteractionConfig(),
    ) -> None:
        self._runtime = runtime
        self._lifecycle = lifecycle
        self._repository = repository
        self._confirmations = confirmations
        self._acceptance = acceptance
        self._lock = asyncio.Lock()
        self._active: dict[str, asyncio.Task[None]] = {}
        self._blocked: set[str] = set()
        self._drain_task: asyncio.Task[None] | None = None
        self._next_queue_sequence = 1
        self._started = False
        self._closing = False
        self._closing_event = asyncio.Event()
        self._interactions = QueueInteractions(
            interaction_config, self._wake_dispatcher
        )

    @property
    def closing_event(self) -> asyncio.Event:
        return self._closing_event

    def begin_shutdown(self) -> None:
        self._closing = True
        self._closing_event.set()
        self._interactions.close()

    def queue_held(self, session_id: str) -> bool:
        return session_id in self._interactions.held_sessions

    async def hold_queue(
        self,
        inbox: SessionInbox,
        owner: Context,
        interaction_id: str,
        message_ids: tuple[str, ...],
    ) -> int:
        async with self._lock:
            self._require_accepting()
            state = await inbox.state()
            if tuple(item.message_id for item in state.next_turn) != message_ids:
                raise InboxQueueConflictError(
                    "The pending queue changed before interaction began."
                )
            return self._interactions.acquire(owner, inbox.session_id, interaction_id)

    async def renew_queue_hold(
        self, session_id: str, owner: Context, interaction_id: str
    ) -> int:
        async with self._lock:
            self._require_accepting()
            return self._interactions.renew(owner, session_id, interaction_id)

    async def release_queue_hold(self, session_id: str, interaction_id: str) -> None:
        async with self._lock:
            self._interactions.release(session_id, interaction_id)

    async def take_queued(
        self, inbox: SessionInbox, message_id: str
    ) -> InboxMessagePayload:
        async with self._lock:
            self._require_accepting()
            return await inbox.take_queued(message_id)

    async def start(self) -> None:
        async with self._lock:
            if self._started:
                raise RuntimeError("Run scheduler has already started.")
            await self._lifecycle.recover_startup()
            self._next_queue_sequence = self._repository.next_queue_sequence()
            self._started = True
            self._wake_dispatcher()

    async def shutdown(self) -> None:
        self.begin_shutdown()
        async with self._lock:
            tasks = tuple(self._active.values())
            drain_task = self._drain_task
            if drain_task is not None and not drain_task.done():
                drain_task.cancel()
            for task in tasks:
                task.cancel()
        if drain_task is not None:
            await asyncio.gather(drain_task, return_exceptions=True)
        if not tasks:
            return
        done, pending = await asyncio.wait(
            tasks,
            timeout=SHUTDOWN_TIMEOUT_SECONDS,
        )
        for task in done:
            _consume_task_result(task)
        if pending:
            logger.error(
                "Run shutdown exceeded %s seconds for %s task(s).",
                SHUTDOWN_TIMEOUT_SECONDS,
                len(pending),
            )
            # Scope resources remain live until execution acknowledges cancellation.
            await asyncio.gather(*pending, return_exceptions=True)
            for task in pending:
                _consume_task_result(task)

    async def queue(self, run_id: str) -> RunDetails:
        async with self._lock:
            self._require_accepting()
            current = self._lifecycle.get_details(run_id)
            if current.run.queue_sequence is None:
                self._require_queue_capacity()
                current = await self._lifecycle.queue(
                    run_id, self._allocate_queue_sequence()
                )
            self._wake_dispatcher()
            return current

    async def accept(
        self, request: RunAcceptanceRequest, *, queue_only: bool = False
    ) -> RunAcceptanceResult:
        existing = self._acceptance.find_idempotent(request)
        if existing is not None:
            return existing
        async with self._lock:
            self._require_accepting()
            existing = self._acceptance.find_idempotent(request)
            if existing is not None:
                return existing
            self._require_queue_capacity()
            result = self._acceptance.accept(
                request,
                self._allocate_queue_sequence(),
                queue_only=queue_only,
            )
            self._wake_dispatcher()
            return result

    async def steer(self, request: RunAcceptanceRequest) -> RunAcceptanceResult:
        existing = self._acceptance.find_idempotent(request)
        if existing is not None:
            return existing
        async with self._lock:
            self._require_accepting()
            existing = self._acceptance.find_idempotent(request)
            if existing is not None:
                return existing
            active = next(
                (
                    turn
                    for turn in self._lifecycle.list_for_session(request.session_id)
                    if turn.run.state not in TERMINAL_RUN_STATES
                ),
                None,
            )
            if active is not None:
                return self._acceptance.steer(request, active.run.id)
        return await self.accept(request)

    async def resume(self, run_id: str) -> RunDetails:
        async with self._lock:
            self._require_accepting()
            self._require_queue_capacity()
            details = await self._lifecycle.resume(
                run_id, self._allocate_queue_sequence()
            )
            self._wake_dispatcher()
            return details

    async def cancel(self, run_id: str) -> RunDetails:
        async with self._lock:
            self._require_accepting()
            task = await self._request_cancel(run_id)
        return await self._finish_cancel(run_id, task)

    async def set_queue_mode(
        self, inbox: SessionInbox, mode: Literal["auto", "manual"]
    ) -> None:
        async with self._lock:
            self._require_accepting()
            await inbox.set_mode(mode)
            self._wake_dispatcher()

    async def reorder_inputs(
        self, inbox: SessionInbox, message_ids: tuple[str, ...]
    ) -> None:
        async with self._lock:
            self._require_accepting()
            await inbox.reorder(message_ids)

    async def send_queued(self, inbox: SessionInbox, message_id: str) -> None:
        async with self._lock:
            self._require_accepting()
            await inbox.dispatch(message_id)
            await inbox.set_mode("auto")
            active = next(
                (
                    turn
                    for turn in self._lifecycle.list_for_session(inbox.session_id)
                    if turn.run.state not in TERMINAL_RUN_STATES
                ),
                None,
            )
            if active is None:
                self._wake_dispatcher()
                return
            run_id = active.run.id
            task = await self._request_cancel(run_id)
        await self._finish_cancel(run_id, task)

    async def clear_queue(self, inbox: SessionInbox) -> None:
        async with self._lock:
            self._require_accepting()
            await inbox.clear_next_turn()

    async def _request_cancel(self, run_id: str) -> asyncio.Task[None] | None:
        task = self._active.get(run_id)
        await self._lifecycle.discard_inputs(run_id)
        self._blocked.add(run_id)
        if task is not None and not task.done():
            task.cancel()
        return task

    async def _finish_cancel(
        self, run_id: str, task: asyncio.Task[None] | None
    ) -> RunDetails:
        if task is not None:
            await asyncio.gather(task, return_exceptions=True)
        async with self._lock:
            try:
                current = self._lifecycle.get_details(run_id)
                if current.run.state is RunState.WAITING_CONFIRMATION:
                    result = self._confirmations.cancel_for_run(run_id)
                    details = RunDetails(
                        result.run,
                        result.model_snapshot,
                        result.tool_calls,
                    )
                else:
                    details = await self._lifecycle.cancel(run_id)
                return details
            finally:
                self._blocked.discard(run_id)
                self._wake_dispatcher()

    async def approve(self, confirmation_id: str) -> ConfirmationDecisionResult:
        async with self._lock:
            self._require_accepting()
            confirmation = self._confirmations.get(confirmation_id)
            queue_sequence: int | None = None
            if confirmation.status is ConfirmationStatus.PENDING:
                self._require_queue_capacity()
                queue_sequence = self._allocate_queue_sequence()
            result = self._confirmations.approve(
                confirmation_id,
                queue_sequence,
            )
            if result.continuation_required:
                self._wake_dispatcher()
            return result

    async def reject(self, confirmation_id: str) -> ConfirmationDecisionResult:
        async with self._lock:
            self._require_accepting()
            return self._confirmations.reject(confirmation_id)

    def _require_accepting(self) -> None:
        if not self._started:
            raise RunSchedulerClosingError("The run scheduler is unavailable.")
        if self._closing:
            raise RunSchedulerClosingError("The backend is shutting down.")

    def _require_queue_capacity(self) -> None:
        if self._repository.queued_count() >= MAX_QUEUED_RUNS:
            raise RunQueueFullError("The run queue is full.")

    def _allocate_queue_sequence(self) -> int:
        sequence = self._next_queue_sequence
        self._next_queue_sequence += 1
        return sequence

    def _wake_dispatcher(self) -> None:
        if self._closing:
            return
        if self._drain_task is None or self._drain_task.done():
            self._drain_task = asyncio.create_task(self._drain())

    async def _drain(self) -> None:
        async with self._lock:
            if self._closing:
                return
            available = MAX_CONCURRENT_RUNS - len(self._active)
            if available <= 0:
                return
            run_ids = self._repository.list_queued_run_ids(
                available,
                frozenset((*self._active, *self._blocked)),
            )
            for session_id in self._repository.list_pending_turn_sessions(
                available - len(run_ids),
                excluded=self._interactions.held_sessions,
            ):
                claimed = self._acceptance.claim_next_turn(session_id)
                if claimed is not None:
                    if claimed.run is None:
                        raise RuntimeError("Claimed input must create a turn.")
                    run_ids += (claimed.run.run.id,)
            for run_id in run_ids:
                task = asyncio.create_task(self._execute(run_id))
                self._active[run_id] = task

    async def _execute(self, run_id: str) -> None:
        try:
            await self._runtime.run(run_id)
        except asyncio.CancelledError:
            raise
        except RunLifecycleConflictError:
            logger.info("Skipped stale queued run %s.", run_id)
        except Exception:
            logger.exception("Run %s failed outside a durable runner boundary.", run_id)
            try:
                await self._lifecycle.interrupt_if_active(
                    run_id,
                    "Run execution stopped at an unexpected runtime boundary.",
                )
            except Exception:
                logger.exception(
                    "Run %s could not persist its unexpected interruption.",
                    run_id,
                )
        finally:
            async with self._lock:
                try:
                    current = self._lifecycle.get_details(run_id)
                    if current.run.state in TERMINAL_RUN_STATES:
                        await self._lifecycle.discard_inputs(run_id)
                finally:
                    if self._active.get(run_id) is asyncio.current_task():
                        self._active.pop(run_id, None)
                    self._wake_dispatcher()


def _consume_task_result(task: asyncio.Task[None]) -> None:
    try:
        task.result()
    except asyncio.CancelledError:
        return
    except Exception:
        logger.exception("Run task failed during shutdown.")
