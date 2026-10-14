"""One approved call creates one analysis job; background reads never resubmit."""

import asyncio
import logging
import time

import httpx

from kunyu.domain.analysis import (
    EXECUTING_STATES,
    AnalysisError,
    AnalysisJob,
    AnalysisOutput,
)
from kunyu.domain.oge import OgeError
from kunyu.integrations.analysis_raster import AnalysisRaster
from kunyu.integrations.filesystem_operation import filesystem_operation
from kunyu.integrations.oge.execution import ExecutionGateway
from kunyu.persistence.analysis import AnalysisRepository

logger = logging.getLogger(__name__)
NDVI_REPLAY_DURATION_SECONDS = 10


class AnalysisService:
    def __init__(
        self,
        repository: AnalysisRepository,
        gateway: ExecutionGateway,
        raster: AnalysisRaster,
    ) -> None:
        self.repository, self.gateway, self.raster = repository, gateway, raster
        self._changed = asyncio.Condition()

    @property
    def binding(self) -> str:
        return self.gateway.binding()

    async def submit(
        self, session_id: str, run_id: str | None, call_id: str
    ) -> AnalysisJob:
        subject, base = self.gateway.subject()
        job, created = self.repository.create(
            session_id, run_id, call_id, self.gateway.mode, subject, base
        )
        if not created:
            return job
        try:
            remote = await self.gateway.submit(job.mode, subject, base)
        except OgeError as error:
            logger.warning("NDVI submission refused (%s).", error.code)
            state = (
                "submission_unknown"
                if error.code in {"OGE_TIMEOUT", "OGE_NETWORK", "OGE_PROTOCOL_ERROR"}
                else "failed"
            )
            self.repository.change(
                job.id, state=state, error_code=error.code, error_message=str(error)
            )
            raise
        except (httpx.RequestError, asyncio.CancelledError):
            self.repository.change(
                job.id,
                state="submission_unknown",
                error_code="SUBMISSION_UNKNOWN",
                error_message="Submission ended without a saved response; the calculation will not be repeated.",
            )
            raise
        replay = job.mode == "replay"
        job = self.repository.change(
            job.id,
            remote_id=remote,
            state="running" if replay else "queued",
            next_poll_at=time.time()
            + (NDVI_REPLAY_DURATION_SECONDS if replay else 0.5),
        )
        await self.notify()
        return job

    async def advance(
        self, job: AnalysisJob, subject: str | None, base: str | None
    ) -> None:
        if job.remote_id is None:
            self.repository.change(
                job.id,
                state="submission_unknown",
                error_code="SUBMISSION_UNKNOWN",
                error_message="Remote identity is missing.",
            )
            return
        status = await self.gateway.status(job.mode, job.remote_id, subject, base)
        if status["resultStatus"] == 0:
            self.repository.change(
                job.id,
                state="running",
                query_state="ready",
                error_code=None,
                error_message=None,
                next_poll_at=time.time() + 10,
            )
            return
        self.repository.change(
            job.id,
            state="collecting",
            query_state="ready",
            error_code=None,
            error_message=None,
        )
        result = await self.gateway.result(job.mode, job.remote_id, subject, base)
        output_id = "out_" + job.id.removeprefix("job_")
        directory = self.raster.directory(output_id)
        if not (directory / "result.tif").is_file():
            await self.gateway.cog(
                job.mode, job.remote_id, subject, base, directory / "result.tif"
            )
        metadata = await filesystem_operation(
            lambda cancelled: self.raster.prepare(output_id, cancelled)
        )
        original = await self.gateway.original_status(
            job.mode, job.remote_id, subject, base
        )
        source = self.gateway.source_metadata if job.mode == "replay" else metadata
        source = {
            **source,
            "execution_result": result,
            "input_mode": "service_defaults",
            "effective_input_known": False,
        }
        self.repository.publish_output(
            job,
            output_id,
            metadata,
            source,
            f"{output_id}/result.tif",
            f"{output_id}/preview.png",
            original,
        )
        self.repository.change(
            job.id,
            state="succeeded",
            query_state="ready",
            error_code=None,
            error_message=None,
        )
        await self.notify()

    async def wait_for_output(
        self, session_id: str, job_id: str
    ) -> tuple[AnalysisJob, AnalysisOutput]:
        async with self._changed:
            while True:
                job = self.repository.job(session_id, job_id)
                if job.state == "succeeded":
                    return job, self.repository.output_for_job(session_id, job.id)
                if job.state not in EXECUTING_STATES or job.query_state != "ready":
                    if job.error_code is None or job.error_message is None:
                        raise AnalysisError(
                            "INVALID_JOB_STATE",
                            f"NDVI job {job.id} cannot continue without recorded error details.",
                        )
                    raise AnalysisError(
                        job.error_code,
                        f"NDVI job {job.id}: {job.error_message} Read this existing job with oge_get_job; do not resubmit it automatically.",
                    )
                await self._changed.wait()

    async def notify(self) -> None:
        async with self._changed:
            self._changed.notify_all()
