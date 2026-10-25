"""One approved call creates one analysis job; background reads never resubmit."""

import asyncio
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime

import httpx
from pydantic import JsonValue

from kunyu.domain.execution.jobs import JobFailure
from kunyu.domain.geospatial.analysis import (
    EXECUTING_STATES,
    AnalysisError,
    AnalysisJob,
    AnalysisOutput,
)
from kunyu.domain.geospatial.oge import OgeError
from kunyu.domain.geospatial.raster import RasterPresentation
from kunyu.integrations.filesystem.operation import filesystem_operation
from kunyu.integrations.geospatial.analysis_raster import AnalysisRaster
from kunyu.integrations.oge.execution import ExecutionGateway
from kunyu.integrations.oge.published_service import PublishedServiceGateway
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
        self.published = PublishedServiceGateway(gateway)
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
        *,
        job_id: str,
        progress: Callable[[str], None],
        append_log: Callable[[str], None],
    ) -> AnalysisJob:
        progress("authenticate")
        subject, base = await self.gateway.subject()
        parameters = {
            **parameters,
            "filename": f"kunyu-result-{datetime.now(UTC):%Y%m%d-%H%M%S-%f}",
        }
        job, created = self.repository.create(
            session_id,
            run_id,
            call_id,
            "live",
            subject,
            base,
            parameters,
            job_id=job_id,
            service="published_service"
            if "service_name" in parameters
            else "execute_code",
        )
        if not created:
            return job
        stage = "prepare"
        try:
            progress(stage)
            name = await filesystem_operation(
                lambda cancelled: self.raster.reserve(
                    job.workspace_id, str(parameters["title"])
                )
            )
            parameters = {**parameters, "result_directory": name}
            job = self.repository.change(job.id, parameters=parameters)
            async with self.gateway.submissions:
                if job.service == "execute_code":
                    stage = "compile"
                    self.repository.change(job.id, stage=stage)
                    progress(stage)
                    compiled = await self.gateway.compile(
                        str(parameters["script"]),
                        str(parameters["title"]),
                        subject,
                        base,
                    )
                    parameters = {**parameters, **compiled}
                    append_log(str(compiled["log"]))
                stage = "submit"
                job = self.repository.change(job.id, parameters=parameters, stage=stage)
                progress(stage)
                if job.service == "published_service":
                    remote = await self.published.submit(
                        str(parameters["service_name"]),
                        parameters["arguments"],
                        subject,
                        base,
                    )
                else:
                    remote = await self.gateway.submit(parameters, subject, base)
        except (OgeError, AnalysisError) as error:
            logger.warning("OGE submission refused (%s).", error.code)
            state = (
                "submission_unknown"
                if stage == "submit"
                and error.code in {"OGE_TIMEOUT", "OGE_NETWORK", "OGE_PROTOCOL_ERROR"}
                else "failed"
            )
            self.repository.change(
                job.id, state=state, error_code=error.code, error_message=str(error)
            )
            raise JobFailure(
                error.code,
                f"{error} Analysis job {job.id}: {state}; no automatic resubmission.",
                stage,
            ) from error
        except (httpx.HTTPError, asyncio.CancelledError) as error:
            self.repository.change(
                job.id,
                state="submission_unknown" if stage == "submit" else "failed",
                error_code="SUBMISSION_UNKNOWN" if stage == "submit" else "OGE_NETWORK",
                error_message=f"{type(error).__name__}: {error}; no automatic resubmission.",
            )
            if isinstance(error, asyncio.CancelledError):
                raise
            raise JobFailure(
                "SUBMISSION_UNKNOWN" if stage == "submit" else "OGE_NETWORK",
                f"{type(error).__name__}: {error}. Analysis job {job.id}; no automatic resubmission.",
                stage,
            ) from error
        job = self.repository.change(
            job.id,
            remote_id=remote,
            state="queued",
            stage="execute",
            next_poll_at=time.time() + 1,
        )
        await self.notify()
        return job

    async def advance(
        self, job: AnalysisJob, subject: str | None, base: str | None
    ) -> None:
        if job.service not in ("execute_code", "published_service"):
            raise AnalysisError(
                "OGE_UNSUPPORTED_SERVICE", f"Unsupported service: {job.service}"
            )
        if job.remote_id is None or subject is None or base is None:
            raise AnalysisError("SUBMISSION_UNKNOWN", "Remote job identity is missing.")
        result = None
        if job.service == "published_service":
            result = await self.published.result(job.remote_id, subject, base)
            state = "running" if result is None else "success"
        else:
            try:
                state = await self.gateway.state(
                    str(job.parameters["dag_id"]), subject, base
                )
            except AnalysisError as error:
                if error.code != "OGE_COMPUTATION_FAILED":
                    raise
                self.repository.change(job.id, stage="execute")
                diagnostics = await self.gateway.failure_detail(
                    job.remote_id, subject, base
                )
                raise AnalysisError(
                    error.code, f"{error} Remote diagnostics: {diagnostics}"
                ) from error
        self.repository.change(
            job.id,
            state="running" if state == "running" else "collecting",
            stage="execute" if state == "running" else "collect",
            query_state="ready",
            error_code=None,
            error_message=None,
            next_poll_at=time.time() + 10,
        )
        if state == "running":
            return
        await self.notify()
        try:
            if job.service == "execute_code":
                result = await self.gateway.result(job.remote_id, subject, base)
        except AnalysisError as error:
            if error.code == "OGE_COMPUTATION_FAILED":
                self.repository.change(job.id, stage="execute")
            raise
        if result is None:
            return
        output_id = "out_" + job.id.removeprefix("job_")
        name = str(job.parameters["result_directory"])
        directory = self.raster.directory(job.workspace_id, name)
        target = directory / "result.tif"
        if not target.is_file():
            downloaded = (
                await self.published.download(job.remote_id, subject, base, target)
                if job.service == "published_service"
                else await self.gateway.download(job.parameters, subject, base, target)
            )
            if not downloaded:
                return
        self.repository.change(job.id, stage="render")
        await self.notify()
        presentation = RasterPresentation.model_validate(job.parameters["presentation"])
        metadata = await filesystem_operation(
            lambda cancelled: self.raster.prepare(
                job.workspace_id, name, presentation, cancelled
            )
        )
        self.repository.publish_output(
            job,
            output_id,
            metadata,
            {"execution_result": result, "parameters": job.parameters},
            f"{job.workspace_id}/results/{name}/result.tif",
            f"{job.workspace_id}/.cache/results/{name}/views/{presentation.default_view}.png",
            200,
        )
        self.repository.change(
            job.id,
            state="succeeded",
            stage="completed",
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
                    raise JobFailure(
                        job.error_code,
                        f"Analysis job {job.id}: {job.error_message}",
                        job.stage,
                    )
                await self._changed.wait()

    async def notify(self) -> None:
        async with self._changed:
            self._changed.notify_all()
