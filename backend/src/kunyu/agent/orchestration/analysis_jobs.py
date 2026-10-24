"""OGE producer adapter: register before effects and resume observation only."""

import httpx
from pydantic import JsonValue

from kunyu.agent.core.scope import AgentScopes
from kunyu.agent.orchestration.jobs import JobHandle, JobRegistry
from kunyu.agent.runtime.contracts.tools import ToolCall, ToolExecutionError
from kunyu.application.analysis.analysis import AnalysisService
from kunyu.domain.execution.jobs import TERMINAL_JOB_STATES, JobFailure
from kunyu.domain.geospatial.analysis import AnalysisError, AnalysisJob
from kunyu.domain.geospatial.oge import OgeError


class AnalysisJobs:
    def __init__(
        self, service: AnalysisService, jobs: JobRegistry, scopes: AgentScopes
    ) -> None:
        self.service, self.jobs, self.scopes = service, jobs, scopes

    def start(
        self, session_id: str, call: ToolCall, parameters: dict[str, JsonValue]
    ) -> str:
        async def execute(handle: JobHandle):
            try:
                job = await self.service.submit(
                    session_id,
                    call.run_id,
                    call.call_id,
                    parameters,
                    job_id=handle.id,
                    progress=handle.progress,
                    append_log=handle.append,
                )
                return await self.observe(session_id, handle, job)
            except (AnalysisError, OgeError) as error:
                stage = self.jobs.require(handle.id, session_id).stage
                raise JobFailure(error.code, str(error), stage) from error
            except httpx.HTTPError as error:
                stage = self.jobs.require(handle.id, session_id).stage
                raise JobFailure(
                    "OGE_NETWORK", f"{type(error).__name__}: {error}", stage
                ) from error

        return self.jobs.start(
            session_id,
            self.scopes.for_session(session_id),
            "analysis",
            str(parameters["title"]),
            execute,
            call=call,
            cancel=self.cancel_remote,
            resumable=True,
        )

    async def observe(
        self, session_id: str, handle: JobHandle, job: AnalysisJob
    ) -> dict:
        _, output = await self.service.wait_for_output(
            session_id,
            job.id,
            progress=lambda current: handle.progress(
                current.stage, current.error_message
            ),
        )
        return {
            "analysis_output_id": output.id,
            "products": output.metadata.get("products", []),
            "limitations": job.parameters.get("limitations", []),
            "output": {
                "id": output.id,
                "title": output.title,
                "file_path": output.file_path,
                "preview_path": output.preview_path,
                "kind": output.kind,
                "metadata": output.metadata,
            },
        }

    async def resume(self) -> None:
        await self.jobs.wait_ready()
        for owner, view in self.jobs.store.list():
            if view.kind != "analysis" or view.status in TERMINAL_JOB_STATES:
                continue

            async def observe(handle: JobHandle, session_id=owner):
                try:
                    job = self.service.repository.job(session_id, handle.id)
                except AnalysisError as error:
                    raise JobFailure(
                        "SUBMISSION_UNKNOWN",
                        "The app stopped before a submission record was saved; no computation will be resubmitted.",
                        self.jobs.require(handle.id, session_id).stage,
                    ) from error
                return await self.observe(session_id, handle, job)

            self.jobs.resume(
                owner,
                self.scopes.for_session(owner),
                view,
                observe,
                cancel=self.cancel_remote,
            )

    @staticmethod
    async def cancel_remote() -> None:
        raise ToolExecutionError(
            "The verified OGE API does not support cancellation. The remote calculation continues.",
            code="OGE_CANCEL_UNSUPPORTED",
        )
