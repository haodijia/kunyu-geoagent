"""Persistent job facts with scoped runtime handles, waits and completion delivery."""

import asyncio
import logging
import math
import time
import traceback
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from uuid import uuid4

from pydantic import JsonValue

from kunyu.agent.core.scope import Context
from kunyu.agent.runtime.contracts.tools import ToolCall, ToolExecutionError
from kunyu.domain.execution.jobs import (
    TERMINAL_JOB_STATES,
    JobError,
    JobFailure,
    JobNotFoundError,
    JobSnapshot,
)
from kunyu.persistence.execution.jobs import SQLAlchemyJobStore

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Job:
    id: str
    owner: str
    cancel: Callable[[], Awaitable[None]] | None
    resumable: bool
    suppress_notice: bool = False
    task: asyncio.Task[None] | None = None


class JobHandle:
    def __init__(self, registry: "JobRegistry", job: Job) -> None:
        self._registry, self._job = registry, job

    @property
    def id(self) -> str:
        return self._job.id

    def append(self, text: str) -> None:
        self._registry.store.append(self.id, self._job.owner, text)

    def progress(self, stage: str, detail: str | None = None) -> None:
        if detail is not None:
            detail = detail.encode("utf-8")[:512].decode("utf-8", errors="ignore")
        current = self._registry.require(self.id, self._job.owner)
        if current.status in TERMINAL_JOB_STATES:
            raise RuntimeError("Cannot update a settled job.")
        if (current.stage, current.detail) != (stage, detail):
            self._registry.store.change(
                self._job.owner,
                current.model_copy(update={"stage": stage, "detail": detail}),
            )


class JobRegistry:
    def __init__(self, store: SQLAlchemyJobStore) -> None:
        self.store = store
        self._jobs: dict[str, Job] = {}
        self._owners: set[str] = set()
        self._signals: dict[str, asyncio.Event] = {}
        self._waiters: dict[str, int] = {}
        self._controller: Callable[[str, JobSnapshot], Awaitable[None]] | None = None
        self._ready = asyncio.Event()
        self._closing = False

    def attach_controller(
        self, deliver: Callable[[str, JobSnapshot], Awaitable[None]]
    ) -> None:
        if self._controller is not None:
            raise RuntimeError("A job controller is already attached.")
        self._controller = deliver
        self._ready.set()

    async def wait_ready(self) -> None:
        await self._ready.wait()

    def start(
        self,
        owner: str,
        scope: Context,
        kind: str,
        label: str,
        run: Callable[[JobHandle], Awaitable[JsonValue]],
        *,
        call: ToolCall,
        cancel: Callable[[], Awaitable[None]] | None = None,
        resumable: bool = False,
    ) -> str:
        self._check_scope(scope)
        job_id = f"job_{uuid4()}"
        view = JobSnapshot(
            id=job_id,
            owner_run_id=call.run_id,
            tool_call_id=call.call_id,
            kind=kind,
            label=label,
            status="running",
            stage="prepare",
            detail=None,
            error=None,
            log_file_path=f"/workspace/.cache/jobs/{job_id}/output.log",
            started_at=time.time(),
            finished_at=None,
        )
        view, created = self.store.create(owner, view)
        if created:
            self._attach(owner, scope, view, run, cancel, resumable)
        return view.id

    def resume(
        self,
        owner: str,
        scope: Context,
        view: JobSnapshot,
        run: Callable[[JobHandle], Awaitable[JsonValue]],
        *,
        cancel: Callable[[], Awaitable[None]] | None = None,
    ) -> None:
        self._check_scope(scope)
        if view.status not in TERMINAL_JOB_STATES and view.id not in self._jobs:
            self._attach(owner, scope, view, run, cancel, True)

    def _check_scope(self, scope: Context) -> None:
        scope.assert_active()
        if self._closing or self._controller is None:
            raise ToolExecutionError("No active background job controller.")

    def _attach(self, owner, scope, view, run, cancel, resumable) -> None:
        if owner not in self._owners:
            self._owners.add(owner)
            scope.effect(lambda: self.close_owner(owner), before_children=True)
        job = Job(view.id, owner, cancel, resumable)
        self._jobs[job.id] = job
        job.task = asyncio.create_task(self._run(job, run), name=f"job:{job.id}")
        job.task.add_done_callback(self._finished)

    @staticmethod
    def _finished(task: asyncio.Task[None]) -> None:
        if not task.cancelled() and (error := task.exception()) is not None:
            logger.error("Background execution ended unexpectedly.", exc_info=error)

    def require(self, job_id: str, owner: str) -> JobSnapshot:
        try:
            return self.store.get(job_id, owner)
        except JobNotFoundError as error:
            raise ToolExecutionError(str(error), code="JOB_NOT_FOUND") from None

    def list(self, owner: str) -> list[dict[str, JsonValue]]:
        return [view.model_dump(mode="json") for _, view in self.store.list(owner)]

    async def wait(self, job_id: str, owner: str, seconds: float) -> JobSnapshot:
        if not math.isfinite(seconds) or seconds <= 0:
            raise ValueError("Job waits require a positive finite timeout.")
        current = self.require(job_id, owner)
        if current.status in TERMINAL_JOB_STATES:
            return current
        signal = self._signals.setdefault(job_id, asyncio.Event())
        self._waiters[job_id] = self._waiters.get(job_id, 0) + 1
        try:
            try:
                async with asyncio.timeout(seconds):
                    await signal.wait()
            except TimeoutError:
                pass  # The waiting deadline never ends the underlying execution.
        finally:
            self._waiters[job_id] -= 1
        return self.require(job_id, owner)

    async def wait_and_read(self, job_id: str, owner: str, seconds: float) -> dict:
        await self.wait(job_id, owner, seconds)
        return self.read(job_id, owner)

    def read_at(self, job_id: str, owner: str, offset: int) -> dict:
        try:
            return self.store.read_at(job_id, owner, offset)
        except JobNotFoundError as error:
            raise ToolExecutionError(str(error), code="JOB_NOT_FOUND") from None
        except ValueError as error:
            raise ToolExecutionError(str(error)) from None

    def read(self, job_id: str, owner: str) -> dict:
        try:
            return self.store.read(job_id, owner)
        except JobNotFoundError as error:
            raise ToolExecutionError(str(error), code="JOB_NOT_FOUND") from None

    async def kill(self, job_id: str, owner: str) -> dict:
        view = self.require(job_id, owner)
        if view.status in TERMINAL_JOB_STATES:
            return {"outcome": "already-finished", "job": view.model_dump(mode="json")}
        job = self._jobs.get(job_id)
        if job is None or job.task is None:
            raise ToolExecutionError(
                "The job exists but its execution handle is not attached.",
                code="JOB_NOT_ATTACHED",
            )
        if job.cancel is not None:
            await job.cancel()
        job.suppress_notice = True
        view = self.store.change(owner, view.model_copy(update={"status": "stopping"}))
        job.task.cancel()
        return {
            "outcome": "cancellation-requested",
            "job": view.model_dump(mode="json"),
        }

    async def _run(
        self, job: Job, run: Callable[[JobHandle], Awaitable[JsonValue]]
    ) -> None:
        view = self.require(job.id, job.owner)
        result: JsonValue = None
        try:
            result = await run(JobHandle(self, job))
            view = self.require(job.id, job.owner).model_copy(
                update={
                    "status": "completed",
                    "stage": "completed",
                    "detail": None,
                    "error": None,
                }
            )
        except asyncio.CancelledError:
            if job.resumable and job.suppress_notice:
                return  # Only the local observer stops; durable remote work remains queryable.
            view = self.require(job.id, job.owner).model_copy(
                update={"status": "killed", "detail": None}
            )
        except Exception as error:
            logger.exception("Background job %s failed.", job.id)
            self.store.append(
                job.id, job.owner, "\n" + "".join(traceback.format_exception(error))
            )
            current = self.require(job.id, job.owner)
            failure = JobError.from_message(
                code=error.code
                if isinstance(error, JobFailure)
                else "JOB_EXECUTION_FAILED",
                message=str(error),
            )
            view = current.model_copy(
                update={
                    "status": "failed",
                    "detail": None,
                    "error": failure,
                    "stage": error.stage
                    if isinstance(error, JobFailure)
                    else current.stage,
                }
            )
        view = self.store.change(
            job.owner,
            view.model_copy(update={"finished_at": time.time()}),
            result=result,
        )
        self._signals.setdefault(job.id, asyncio.Event()).set()
        if (
            not self._waiters.get(job.id, 0)
            and not job.suppress_notice
            and not self._closing
        ):
            if self._controller is None:
                raise RuntimeError("The job controller detached before settlement.")
            try:
                await self._controller(job.owner, view)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Could not deliver completion for job %s.", job.id)

    async def close_owner(self, owner: str) -> None:
        jobs = [
            job
            for job in self._jobs.values()
            if job.owner == owner
            and (
                self._closing
                or not job.resumable
                or job.task is None
                or job.task.done()
            )
        ]
        for job in jobs:
            job.suppress_notice = True
            if job.task is not None and not job.task.done():
                job.task.cancel()
        await asyncio.gather(
            *(job.task for job in jobs if job.task is not None), return_exceptions=False
        )
        for job in jobs:
            del self._jobs[job.id]
        self._owners.discard(owner)

    async def close(self) -> None:
        self._closing = True
        for owner in {job.owner for job in self._jobs.values()}:
            await self.close_owner(owner)
