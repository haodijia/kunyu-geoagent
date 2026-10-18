"""Approved service producers register one session-owned background job."""

from kunyu.agent.tools.outputs.oge import ANALYSIS
from kunyu.agent.runtime.contracts.tools import BaseTool

import asyncio
import json
import logging
import math
from collections.abc import Mapping

from pydantic import Field, model_validator

from kunyu.agent.core.scope import AgentScopes
from kunyu.agent.orchestration.jobs import JobHandle, JobRegistry
from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.tools import (
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
from kunyu.application.analysis.analysis import AnalysisService
from kunyu.application.analysis.oge import OgeService
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.geospatial.analysis import AnalysisError, AnalysisJob
from kunyu.domain.geospatial.map_context import TurnMapContext
from kunyu.domain.geospatial.oge import OgeError

logger = logging.getLogger(__name__)


class ExecuteCodeArguments(ToolArguments):
    title: str = Field(min_length=1, max_length=120)
    code: str = Field(
        min_length=1,
        max_length=12000,
        description="OGE Python SDK code; compose operators then export exactly one Coverage with result.export(name). selected_image is injected from image_id or the map selection.",
    )
    image_id: int | None = Field(
        default=None,
        gt=0,
        description="Real OGE image ID, independent of search candidate sets. Omit to use the user's map selection, or when the script loads its own inputs.",
    )
    crs: str = Field(pattern=r"^EPSG:[0-9]{4,6}$")
    scale: float = Field(gt=0, le=100000, allow_inf_nan=False)
    display_range: list[float] | None = Field(
        default=None,
        min_length=2,
        max_length=2,
        description="Optional numeric display minimum/maximum; does not modify raw raster values.",
    )

    @model_validator(mode="after")
    def valid_range(self):
        if self.display_range is not None and (
            not all(math.isfinite(value) for value in self.display_range)
            or self.display_range[0] >= self.display_range[1]
        ):
            raise ValueError("display_range requires finite minimum < maximum.")
        return self


class ExecuteCodeTool(BaseTool):
    output_contract = ANALYSIS

    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        service: AnalysisService,
        jobs: JobRegistry,
        scopes: AgentScopes,
        oge: OgeService,
        *,
        wait_timeout_seconds: int = 120,
    ) -> None:
        self._run_id, self._contexts, self._service = run_id, contexts, service
        self._oge = oge
        self._arguments = ExecuteCodeArguments
        self._wait_timeout_seconds = wait_timeout_seconds
        self._jobs, self._scopes = jobs, scopes
        self.spec = ToolSpec(
            name="oge_execute_code",
            description=tool_description("oge_execute_code"),
            parameters=ExecuteCodeArguments.model_json_schema(),
            risk_level=ToolRiskLevel.L2,
            execution="exclusive",
            presentation="write",
            timeout_ms=330_000,
            approval=ToolApproval(
                execution="tool",
                binding=service.binding,
                summary="Execute the approved OGE Python operator chain.",
                side_effect="Compiles remote code, submits one raster batch export and downloads the numeric GeoTIFF.",
            ),
        )

    async def _parameters(self, args: ExecuteCodeArguments) -> dict:
        source = load_source(self._contexts, self._run_id)
        frozen_map = source.run.map_snapshot
        for message in reversed(source.reduced_session.user_messages):
            if (
                message.run_id == self._run_id
                and message.source == "user"
                and message.delivery == "steer"
                and not message.discarded
                and message.applied_step is not None
                and message.applied_step <= source.run.step
            ):
                frozen_map = message.map_context
                break
        selection = TurnMapContext.model_validate(frozen_map).image_selection
        image_id = args.image_id
        if image_id is None and selection is not None:
            image_id = selection.image_id
        image = None
        if image_id is not None:
            detail = await self._oge.image_detail(image_id)
            image = {
                "coverageID": detail["imageIdentification"],
                "productID": detail["productName"],
            }
        # Serialize data as a Python string literal; never execute model code locally.
        prelude = (
            "import json as _kunyu_json\nselected_image = _kunyu_json.loads("
            + repr(json.dumps(image))
            + ")\n"
        )
        return {
            "title": args.title,
            "script": prelude + args.code,
            "image_id": image_id,
            "selected_image": image,
            "crs": args.crs,
            "scale": args.scale,
            "display_range": None
            if args.display_range is None
            else list(args.display_range),
        }

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self._arguments, arguments)

    async def _submit(
        self, call: ToolCall, session_id: str, arguments: ExecuteCodeArguments
    ) -> AnalysisJob:
        return await self._service.submit(
            session_id,
            call.run_id,
            call.call_id,
            await self._parameters(arguments),
        )

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        arguments = validate_model(self.spec.name, self._arguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        try:
            job = await self._submit(call, source.session.id, arguments)
        except (AnalysisError, OgeError) as error:
            raise ToolExecutionError(str(error), code=error.code) from None

        async def observe(handle: JobHandle):
            handle.append(str(job.parameters["log"]))
            completed, output = await self._service.wait_for_output(
                source.session.id,
                job.id,
                progress=lambda current: handle.progress(
                    current.state
                    if current.error_message is None
                    else f"{current.state}: {current.error_message}"
                ),
            )
            return {
                "analysis_job_id": job.id,
                "analysis_output_id": output.id,
                "job": {
                    "id": completed.id,
                    "state": completed.state,
                    "service": completed.service,
                },
                "output": {
                    "id": output.id,
                    "title": output.title,
                    "kind": output.kind,
                    "metadata": output.metadata,
                },
            }

        async def cancel_remote() -> None:
            raise ToolExecutionError(
                "The verified OGE API does not support cancellation. The remote calculation continues.",
                code="OGE_CANCEL_UNSUPPORTED",
            )

        background_id = self._jobs.start(
            source.session.id,
            self._scopes.for_session(source.session.id),
            "analysis",
            f"{self.spec.name}: {job.id}",
            observe,
            cancel=cancel_remote,
            reference=job.id,
        )
        try:
            await self._jobs.wait(
                background_id, source.session.id, self._wait_timeout_seconds
            )
        except asyncio.CancelledError:
            logger.info(
                "Stopped the foreground wait for %s; the owned job continues.",
                background_id,
            )
            raise
        return tool_result(
            {
                "analysis_job_id": job.id,
                **self._jobs.read(background_id, source.session.id),
            }
        )
