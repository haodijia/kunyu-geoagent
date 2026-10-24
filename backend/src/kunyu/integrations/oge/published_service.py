"""The published GP protocol is distinct from executeCode batch jobs."""

from pathlib import Path
from uuid import UUID

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.oge import OgeError
from kunyu.integrations.oge.execution import ExecutionGateway


class PublishedServiceGateway:
    def __init__(self, execution: ExecutionGateway) -> None:
        self.execution = execution

    async def submit(self, name: str, parameters: dict, subject: str, base: str) -> str:
        value = await self.execution.request(
            "POST",
            f"/management/gp-service/process/{name}/api",
            subject,
            base,
            body=parameters,
        )
        try:
            job = value["processId"]
            if not job.startswith("job-"):
                raise ValueError("Missing job prefix")
            UUID(job.removeprefix("job-"))
        except (KeyError, TypeError, AttributeError, ValueError) as error:
            raise OgeError(
                "OGE_PROTOCOL_ERROR", "GP提交没有返回有效任务ID。"
            ) from error
        return job

    async def result(self, job: str, subject: str, base: str) -> dict | None:
        state = await self.execution.request(
            "GET",
            f"/computation-api/process/{job}",
            subject,
            base,
        )
        if not isinstance(state, dict) or state.get("recordId") != job:
            raise AnalysisError("OGE_RESULT_IDENTITY", "GP状态与提交任务不一致。")
        # Engine result reports RUNNING/FAILED explicitly; do not guess GP numeric failure codes.
        result = await self.execution.result(job, subject, base)
        if result is None:
            if state.get("resultStatus") not in (0, 1):
                raise AnalysisError(
                    "OGE_UNKNOWN_STATE", f"未知GP状态：{state.get('resultStatus')}。"
                )
            return None
        if state.get("resultStatus") != 1 or state.get("resultFileStatus") != 1:
            return None  # Successful engine output can precede file registration.
        return result

    async def download(self, job: str, subject: str, base: str, target: Path) -> bool:
        return await self.execution.download_file(
            f"/computation-api/styles/cog/{job}",
            None,
            subject,
            base,
            target,
        )
