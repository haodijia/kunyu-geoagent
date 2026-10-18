"""Durable model previews and source GeoTIFF download references."""

from kunyu.agent.runtime.contracts.tools import BaseTool
from kunyu.agent.tools.outputs.oge import DOWNLOAD, PREVIEW

from collections.abc import Mapping
from uuid import uuid4

from pydantic import Field

from kunyu.agent.prompts.loader import tool_description
from kunyu.agent.runtime.contracts.input_content import ImageInputBlock
from kunyu.agent.runtime.contracts.models import ModelAdapterError
from kunyu.agent.runtime.contracts.tools import (
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
from kunyu.application.conversation.attachment_preparation import normalize_image
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.conversation.attachments import (
    AttachmentError,
    PreparedAttachment,
    ToolImageProducer,
    attachment_path,
)
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.filesystem.operation import filesystem_operation
from kunyu.integrations.model.request_images import prepare_image
from kunyu.persistence.conversation.attachments import SQLAlchemyAttachmentStore


class OutputArguments(ToolArguments):
    output_id: str = Field(min_length=1, max_length=64)


class ResultTool(BaseTool):
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        service: AnalysisService,
        attachments: SQLAlchemyAttachmentStore,
        *,
        name: str,
    ) -> None:
        self.output_contract = {
            "oge_download_preview": PREVIEW,
            "oge_download_result": DOWNLOAD,
        }[name]
        self._run_id, self._contexts, self._service, self._attachments = (
            run_id,
            contexts,
            service,
            attachments,
        )
        self._arguments = OutputArguments
        self.spec = ToolSpec(
            name=name,
            description=tool_description(name),
            parameters=self._arguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="search",
            timeout_ms=30_000,
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, self._arguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        args = validate_model(self.spec.name, self._arguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        try:
            output = self._service.repository.output(source.session.id, args.output_id)
            _cog, preview = self._service.repository.files(
                output.workspace_id, output.id
            )
        except AnalysisError as error:
            raise ToolExecutionError(str(error), code=error.code) from None
        if self.spec.name == "oge_download_result":
            return tool_result(
                {
                    "analysis_output_id": output.id,
                    "kind": output.kind,
                    "available": True,
                    "download_endpoint": f"/api/v1/workspaces/{output.workspace_id}/results/{output.id}/download",
                    "numeric_values_available": output.metadata.get(
                        "numeric_values_available", False
                    ),
                }
            )
        snapshot = source.run.request_snapshot
        if snapshot is None or not snapshot.image_input.enabled:
            raise ToolExecutionError(
                "Enable image input for the calling model and start a new turn before reading a result image.",
                code="IMAGE_INPUT_DISABLED",
            )

        def publish(cancelled):
            check_cancelled(cancelled, "analysis preview")
            raw = self._service.raster.path(preview).read_bytes()
            ref, data = normalize_image(
                str(uuid4()), "analysis-preview.png", "image/png", raw
            )
            ref = ref.model_copy(
                update={
                    "producer": ToolImageProducer(
                        run_id=call.run_id, tool_call_id=call.call_id
                    )
                }
            )
            prepare_image(ref, data, snapshot.image_input)
            check_cancelled(cancelled, "publish analysis preview")
            self._attachments.save_batch(
                source.session.id, (PreparedAttachment(ref, data, raw, "image/png"),)
            )
            return ref

        try:
            ref = await filesystem_operation(publish)
        except (AttachmentError, ModelAdapterError) as error:
            raise ToolExecutionError(
                str(error),
                code=error.code.value
                if isinstance(error, ModelAdapterError)
                else error.code,
            ) from error
        result = tool_result(
            {
                "analysis_output_id": output.id,
                "path": attachment_path(ref),
                "kind": "raster_preview",
                "numeric_values_available": output.metadata.get(
                    "numeric_values_available", False
                ),
            }
        )
        return ToolResult(
            content=(*result.content, ImageInputBlock(attachment=ref)),
            result=result.result,
        )
