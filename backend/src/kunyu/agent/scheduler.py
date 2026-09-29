"""Process-local FIFO scheduling around durable run boundaries."""

import asyncio
import logging

from dsh.events import RunState
from dsh.runtime import AgentRuntime
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

    @property
    def closing_event(self) -> asyncio.Event:
        return self._closing_event

    def begin_shutdown(self) -> None:
        self._closing = True
        self._closing_event.set()

    async def start(self) -> None:
        async with self._lock:
            if self._started:
                raise RuntimeError("Run scheduler has already started.")
            await self._lifecycle.recover_startup()
            self._next_queue_sequence = self._repository.next_queue_sequence()
            self._started = True

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

    async def accept(self, request: RunAcceptanceRequest) -> RunAcceptanceResult:
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
            )
            self._wake_dispatcher()
            return result

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
            task = self._active.get(run_id)
            if task is not None and not task.done():
                self._blocked.add(run_id)
                task.cancel()
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
