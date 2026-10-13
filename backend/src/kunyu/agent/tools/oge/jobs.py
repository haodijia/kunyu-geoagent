"""Session-bound job reads and bounded waits over persistent supervision."""

from collections.abc import Mapping

from pydantic import Field

from kunyu.agent.prompt_files import tool_description
from kunyu.agent.runtime.tools import (
    ToolCall,
    ToolExecutionError,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    tool_result,
    validate_arguments,
    validate_model,
)
from kunyu.application.analysis import AnalysisService
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.analysis import AnalysisError


class JobArguments(ToolArguments):
    job_id: str = Field(min_length=1, max_length=64)


class WaitJobArguments(JobArguments):
    timeout_seconds: int = Field(default=15, ge=1, le=30)


class JobTool:
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        service: AnalysisService,
        *,
        wait: bool,
    ) -> None:
        self._run_id, self._contexts, self._service, self._wait = (
            run_id,
            contexts,
            service,
            wait,
        )
        self._arguments = WaitJobArguments if wait else JobArguments
        name = "oge_wait_job" if wait else "oge_get_job"
        self.spec = ToolSpec(
            name=name,
            description=tool_description(name),
            parameters=self._arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="search",
            timeout_ms=35_000,
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self._arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        args = validate_model(self.spec.name, self._arguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        try:
            job = (
                await self._service.wait(
                    source.session.id, args.job_id, args.timeout_seconds
                )
                if isinstance(args, WaitJobArguments)
                else self._service.repository.job(source.session.id, args.job_id)
            )
            outputs = [
                item.model_dump(mode="json")
                for item in self._service.repository.outputs(source.session.id)
                if item.job_id == job.id
            ]
        except AnalysisError as error:
            raise ToolExecutionError(str(error), code=error.code) from None
        return tool_result(
            {
                "analysis_job_id": job.id,
                "job": job.model_dump(mode="json"),
                "outputs": outputs,
            }
        )
