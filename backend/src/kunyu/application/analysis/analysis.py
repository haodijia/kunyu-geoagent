"""One approved call creates one analysis job; background reads never resubmit."""

import asyncio
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime

import httpx
from pydantic import JsonValue

from kunyu.domain.geospatial.analysis import (
    EXECUTING_STATES,
    AnalysisError,
    AnalysisJob,
    AnalysisOutput,
)
from kunyu.domain.geospatial.oge import OgeError
from kunyu.integrations.filesystem.operation import filesystem_operation
from kunyu.integrations.geospatial.analysis_raster import AnalysisRaster
from kunyu.integrations.oge.execution import ExecutionGateway
from kunyu.persistence.geospatial.analysis import AnalysisRepository

logger = logging.getLogger(__name__)


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
        self,
        session_id: str,
        run_id: str | None,
        call_id: str,
        parameters: dict[str, JsonValue],
    ) -> AnalysisJob:
        subject, base = await self.gateway.subject()
        parameters = {
            **parameters,
            "filename": f"kunyu-result-{datetime.now(UTC):%Y%m%d-%H%M%S-%f}",
        }
        job, created = self.repository.create(
            session_id, run_id, call_id, "live", subject, base, parameters
        )
        if not created:
            return job
        try:
            name = await filesystem_operation(
                lambda cancelled: self.raster.reserve(
                    job.workspace_id, str(parameters["title"])
                )
            )
            parameters = {**parameters, "result_directory": name}
            job = self.repository.change(job.id, parameters=parameters)
            async with self.gateway.submissions:
                compiled = await self.gateway.compile(
                    str(parameters["script"]), str(parameters["title"]), subject, base
                )
                parameters = {**parameters, **compiled}
                job = self.repository.change(job.id, parameters=parameters)
                remote = await self.gateway.submit(parameters, subject, base)
        except (OgeError, AnalysisError) as error:
            logger.warning("OGE code submission refused (%s).", error.code)
            state = (
                "submission_unknown"
                if error.code in {"OGE_TIMEOUT", "OGE_NETWORK", "OGE_PROTOCOL_ERROR"}
                else "failed"
            )
            self.repository.change(
                job.id, state=state, error_code=error.code, error_message=str(error)
            )
            raise AnalysisError(
                error.code,
                f"{error} Analysis job {job.id}: {state}; no automatic resubmission.",
            ) from error
        except (httpx.HTTPError, asyncio.CancelledError) as error:
            self.repository.change(
                job.id,
                state="submission_unknown",
                error_code="SUBMISSION_UNKNOWN",
                error_message="Submission ended without a saved response; it will not be repeated.",
            )
            if isinstance(error, asyncio.CancelledError):
                raise
            raise AnalysisError(
                "SUBMISSION_UNKNOWN",
                f"Analysis job {job.id} has an uncertain submission response; do not repeat the calculation.",
            ) from error
        job = self.repository.change(
            job.id,
            remote_id=remote,
            state="queued",
            next_poll_at=time.time() + 1,
        )
        await self.notify()
        return job

    async def advance(
        self, job: AnalysisJob, subject: str | None, base: str | None
    ) -> None:
        if job.service != "execute_code":
            raise AnalysisError(
                "OGE_SERVICE_REMOVED",
                "The former NDVI GP execution service has been removed.",
            )
        if job.remote_id is None or subject is None or base is None:
            raise AnalysisError("SUBMISSION_UNKNOWN", "Remote job identity is missing.")
        state = await self.gateway.state(str(job.parameters["dag_id"]), subject, base)
        self.repository.change(
            job.id,
            state="running" if state == "running" else "collecting",
            query_state="ready",
            error_code=None,
            error_message=None,
            next_poll_at=time.time() + 10,
        )
        if state == "running":
            return
        result = await self.gateway.result(job.remote_id, subject, base)
        if result is None:
            return
        output_id = "out_" + job.id.removeprefix("job_")
        name = str(job.parameters["result_directory"])
        directory = self.raster.directory(job.workspace_id, name)
        if not (directory / "result.tif").is_file() and not await self.gateway.download(
            job.parameters, subject, base, directory / "result.tif"
        ):
            return
        metadata = await filesystem_operation(
            lambda cancelled: self.raster.prepare(
                job.workspace_id,
                name,
                cancelled,
            )
        )
        self.repository.publish_output(
            job,
            output_id,
            metadata,
            {"execution_result": result, "parameters": job.parameters},
            f"{job.workspace_id}/results/{name}/result.tif",
            f"{job.workspace_id}/.cache/results/{name}/preview.png",
            200,
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
        self,
        session_id: str,
        job_id: str,
        *,
        progress: Callable[[AnalysisJob], None] | None = None,
    ) -> tuple[AnalysisJob, AnalysisOutput]:
        async with self._changed:
            while True:
                job = self.repository.job(session_id, job_id)
                if progress is not None:
                    progress(job)
                if job.state == "succeeded":
                    return job, self.repository.output_for_job(session_id, job.id)
                if job.state not in EXECUTING_STATES:
                    if job.error_code is None or job.error_message is None:
                        raise AnalysisError(
                            "INVALID_JOB_STATE",
                            f"Analysis job {job.id} cannot continue without recorded error details.",
                        )
                    raise AnalysisError(
                        job.error_code,
                        f"Analysis job {job.id}: {job.error_message}",
                    )
                await self._changed.wait()

    async def notify(self) -> None:
        async with self._changed:
            self._changed.notify_all()
