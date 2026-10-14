"""Shared approved service calls that finish only after a prepared result."""

import asyncio
import logging
from abc import ABC, abstractmethod
from collections.abc import Mapping

from kunyu.agent.prompt_files import tool_description
from kunyu.agent.runtime.tools import (
    ToolApproval,
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
from kunyu.domain.analysis import AnalysisError, AnalysisJob
from kunyu.domain.oge import OgeError

logger = logging.getLogger(__name__)


class OgeServiceTool[T: ToolArguments](ABC):
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        service: AnalysisService,
        name: str,
        arguments: type[T],
        approval: ToolApproval,
        *,
        wait_timeout_seconds: int = 15 * 60,
    ) -> None:
        if wait_timeout_seconds <= 0:
            raise ValueError("A service result wait must have a positive timeout.")
        self._run_id, self._contexts, self._service = run_id, contexts, service
        self._arguments = arguments
        self._wait_timeout_seconds = wait_timeout_seconds
        self.spec = ToolSpec(
            name=name,
            description=tool_description(name),
            parameters=arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L2,
            execution="exclusive",
            presentation="write",
            timeout_ms=(wait_timeout_seconds + 30) * 1_000,
            timeout_error_code="ANALYSIS_WAIT_TIMEOUT",
            approval=approval,
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self._arguments, arguments)

    @abstractmethod
    async def _submit(
        self, call: ToolCall, session_id: str, arguments: T
    ) -> AnalysisJob:
        """Submit this service's validated inputs and return its durable job."""

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        arguments = validate_model(self.spec.name, self._arguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        try:
            job = await self._submit(call, source.session.id, arguments)
        except (AnalysisError, OgeError) as error:
            raise ToolExecutionError(str(error), code=error.code) from None
        try:
            async with asyncio.timeout(self._wait_timeout_seconds):
                job, output = await self._service.wait_for_output(
                    source.session.id, job.id
                )
        except TimeoutError:
            raise ToolExecutionError(
                f"Stopped waiting after {self._wait_timeout_seconds} seconds for analysis job {job.id}. Background supervision continues; the remote computation was not cancelled.",
                code="ANALYSIS_WAIT_TIMEOUT",
            ) from None
        except AnalysisError as error:
            raise ToolExecutionError(str(error), code=error.code) from None
        except asyncio.CancelledError:
            logger.info(
                "Stopped waiting for analysis job %s (%s); background supervision continues.",
                job.id,
                self.spec.name,
            )
            raise
        return tool_result(
            {
                "analysis_job_id": job.id,
                "analysis_output_id": output.id,
                "job": job.model_dump(mode="json"),
                "output": output.model_dump(mode="json"),
            }
        )
