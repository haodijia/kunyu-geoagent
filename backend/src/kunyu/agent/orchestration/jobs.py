"""Session-owned background jobs, following harness jobs/jobs-local semantics."""

import asyncio
import json
import logging
import math
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Literal
from uuid import uuid4

from pydantic import JsonValue

from kunyu.agent.core.scope import Context
from kunyu.agent.runtime.contracts.tools import ToolExecutionError

logger = logging.getLogger(__name__)
JobStatus = Literal["running", "stopping", "completed", "failed", "killed"]
OUTPUT_LIMIT = 256_000


@dataclass(slots=True)
class Job:
    id: str
    owner: str
    kind: str
    label: str
    cancel: Callable[[], Awaitable[None]] | None
    notice_id: str = field(default_factory=lambda: uuid4().hex)
    status: JobStatus = "running"
    detail: str | None = None
    started_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    result: JsonValue = None
    result_delivered: bool = False
    output: bytes = b""
    offset: int = 0
    cursor: int = 0
    waiters: int = 0
    suppress_notice: bool = False
    settled: asyncio.Event = field(default_factory=asyncio.Event)
    task: asyncio.Task[None] | None = None

    def snapshot(self) -> dict[str, JsonValue]:
        return {
            "id": self.id,
            "kind": self.kind,
            "label": self.label,
            "status": self.status,
            "detail": self.detail,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }


class JobHandle:
    def __init__(self, job: Job) -> None:
        self._job = job

    def append(self, text: str) -> None:
        if self._job.settled.is_set():
            raise RuntimeError("Cannot append output after job settlement.")
        output = self._job.output + text.encode("utf-8")
        removed = max(0, len(output) - OUTPUT_LIMIT)
        self._job.offset += removed
        self._job.output = output[removed:]

    def progress(self, detail: str) -> None:
        if self._job.settled.is_set():
            raise RuntimeError("Cannot update a settled job.")
        self._job.detail = detail[:512]


class JobRegistry:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._counters: dict[str, int] = {}
        self._owners: set[str] = set()
        self._references: dict[tuple[str, str], str] = {}
        self._owner_closures: dict[str, asyncio.Task[None]] = {}
        self._controller: Callable[[Job], Awaitable[None]] | None = None
        self._closing = False

    def attach_controller(self, deliver: Callable[[Job], Awaitable[None]]) -> None:
        if self._controller is not None:
            raise RuntimeError("A job controller is already attached.")
        self._controller = deliver

    def start(
        self,
        owner: str,
        scope: Context,
        kind: str,
        label: str,
        run: Callable[[JobHandle], Awaitable[JsonValue]],
        *,
        cancel: Callable[[], Awaitable[None]] | None = None,
        reference: str | None = None,
    ) -> str:
        scope.assert_active()
        if self._closing or self._controller is None:
            raise ToolExecutionError("No active background job controller.")
        previous_close = self._owner_closures.get(owner)
        if previous_close is not None:
            if not previous_close.done():
                raise ToolExecutionError("The job owner is being disposed.")
            previous_close.result()
            del self._owner_closures[owner]
        if not kind or not label or len(kind) > 64 or len(label) > 200:
            raise ValueError("Background jobs require a kind and label.")
        if reference is not None and (owner, reference) in self._references:
            return self._references[owner, reference]
        if owner not in self._owners:
            self._owners.add(owner)
            scope.effect(lambda: self.close_owner(owner), before_children=True)
        number = self._counters.get(kind, 0) + 1
        self._counters[kind] = number
        job = Job(f"{kind}-{number}", owner, kind, label, cancel)
        self._jobs[job.id] = job
        if reference is not None:
            self._references[owner, reference] = job.id
        job.task = asyncio.create_task(self._run(job, run), name=f"job:{job.id}")
        job.task.add_done_callback(lambda task: self._finished(job, task))
        return job.id

    @staticmethod
    def _finished(job: Job, task: asyncio.Task[None]) -> None:
        if task.cancelled() and not job.settled.is_set():
            job.status, job.finished_at = "killed", time.time()
            job.settled.set()
        elif not task.cancelled():
            error = task.exception()
            if error is not None:
                logger.error("Job task %s ended unexpectedly.", job.id, exc_info=error)

    def require(self, job_id: str, owner: str) -> Job:
        job = self._jobs.get(job_id)
        if job is None or job.owner != owner:
            raise ToolExecutionError(
                "Background job not found in this session.", code="JOB_NOT_FOUND"
            )
        return job

    def list(self, owner: str) -> list[dict[str, JsonValue]]:
        return [job.snapshot() for job in self._jobs.values() if job.owner == owner]

    async def wait(self, job_id: str, owner: str, seconds: float) -> Job:
        if not math.isfinite(seconds) or seconds <= 0:
            raise ValueError("Job waits require a positive finite timeout.")
        job = self.require(job_id, owner)
        job.waiters += 1
        try:
            try:
                async with asyncio.timeout(seconds):
                    await job.settled.wait()
            except TimeoutError:
                pass  # A wait deadline leaves the job running.
        finally:
            job.waiters -= 1
        return job

    def read_at(self, job_id: str, owner: str, offset: int) -> dict[str, JsonValue]:
        job = self.require(job_id, owner)
        end = job.offset + len(job.output)
        if offset < 0 or offset > end:
            raise ToolExecutionError("Invalid background output offset.")
        return {
            "text": job.output[max(0, offset - job.offset) :].decode(
                "utf-8", errors="ignore"
            ),
            "next_offset": end,
            "lossy": offset < job.offset,
            "job": job.snapshot(),
        }

    def read(self, job_id: str, owner: str) -> dict[str, JsonValue]:
        job = self.require(job_id, owner)
        value = self.read_at(job_id, owner, job.cursor)
        job.cursor = job.offset + len(job.output)
        if job.settled.is_set() and not job.result_delivered:
            value["result"] = job.result
            job.result_delivered = True
        # Respect the existing 16 KiB model tool-result contract, including metadata.
        text = value["text"]
        value["text"] = ""
        budget = max(0, 15_000 - len(json.dumps(value, ensure_ascii=False).encode()))
        encoded = text.encode("utf-8")
        if len(encoded) > budget:
            value["text"] = (
                encoded[-budget:].decode("utf-8", errors="ignore") if budget else ""
            )
            value["lossy"] = True
        else:
            value["text"] = text
        while (
            len(json.dumps(value, ensure_ascii=False).encode()) > 15_000
            and value["text"]
        ):
            value["text"] = value["text"][len(value["text"]) // 2 + 1 :]
            value["lossy"] = True
        return value

    async def kill(self, job_id: str, owner: str) -> dict[str, JsonValue]:
        job = self.require(job_id, owner)
        if job.settled.is_set():
            return {"outcome": "already-finished", "job": job.snapshot()}
        # Producer cancellation must succeed before we claim cancellation was requested.
        if job.cancel is not None:
            await job.cancel()
        if job.settled.is_set():
            return {"outcome": "already-finished", "job": job.snapshot()}
        job.suppress_notice = True
        job.status = "stopping"
        if job.task is None:
            raise RuntimeError("A registered job has no task.")
        job.task.cancel()
        return {"outcome": "cancellation-requested", "job": job.snapshot()}

    async def _run(
        self, job: Job, run: Callable[[JobHandle], Awaitable[JsonValue]]
    ) -> None:
        try:
            job.result = await run(JobHandle(job))
            if len(json.dumps(job.result, ensure_ascii=False).encode()) > 10_000:
                raise ValueError(
                    "Background result exceeds the model result limit; return a durable artifact reference."
                )
            job.status = "completed"
            job.detail = None
        except asyncio.CancelledError:
            job.status = "killed"
        except Exception as error:
            logger.exception("Background job %s failed.", job.id)
            job.result = None
            job.status, job.detail = "failed", str(error)[:512]
        finally:
            job.finished_at = time.time()
            awaited = job.waiters > 0
            job.settled.set()
        if not awaited and not job.suppress_notice and not self._closing:
            if self._controller is None:
                raise RuntimeError("The job controller detached before settlement.")
            try:
                await self._controller(job)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Could not deliver completion for job %s.", job.id)

    async def close_owner(self, owner: str) -> None:
        task = self._owner_closures.get(owner)
        if task is None:
            task = asyncio.create_task(
                self._close_owner(owner), name=f"close-jobs:{owner}"
            )
            self._owner_closures[owner] = task
        await asyncio.shield(task)

    async def _close_owner(self, owner: str) -> None:
        jobs = [job for job in self._jobs.values() if job.owner == owner]
        for job in jobs:
            job.suppress_notice = True
            if job.task is not None and not job.task.done():
                job.task.cancel()
        await asyncio.gather(
            *(job.task for job in jobs if job.task is not None), return_exceptions=True
        )
        for job in jobs:
            del self._jobs[job.id]
        self._owners.discard(owner)
        self._references = {
            key: value for key, value in self._references.items() if key[0] != owner
        }

    async def close(self) -> None:
        self._closing = True
        for owner in tuple(self._owners):
            await self.close_owner(owner)
