"""Persist OGE PNG previews through the existing model-visible image receipt flow."""

from threading import Event
from uuid import uuid4

from kunyu.agent.runtime.contracts.input_content import ImageInputBlock
from kunyu.agent.runtime.contracts.models import ModelAdapterError
from kunyu.agent.runtime.contracts.tools import ToolCall, ToolExecutionError, ToolResult
from kunyu.agent.tools.oge.arguments import ImageArguments
from kunyu.agent.tools.oge.shared import OgeTool, oge_tool_error
from kunyu.agent.tools.shared import tool_result
from kunyu.application.analysis.oge import OgeService
from kunyu.application.conversation.attachment_preparation import normalize_image
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.conversation.attachments import (
    AttachmentError,
    ImageAttachment,
    PreparedAttachment,
    ToolImageProducer,
    attachment_path,
)
from kunyu.domain.geospatial.oge import OgeError
from kunyu.domain.models.model_images import ModelImageInput
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.filesystem.operation import filesystem_operation
from kunyu.integrations.model.request_images import prepare_image
from kunyu.persistence.conversation.attachments import SQLAlchemyAttachmentStore


class ImagePreviewTool(OgeTool[ImageArguments]):
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        service: OgeService,
        attachments: SQLAlchemyAttachmentStore,
    ) -> None:
        super().__init__(
            run_id, contexts, service, "oge_get_image_preview", ImageArguments
        )
        self._attachments = attachments

    async def execute(self, call: ToolCall) -> ToolResult:
        arguments, source = self.parse(call)
        snapshot = source.run.request_snapshot
        if snapshot is None:
            raise ToolExecutionError(
                "The calling model route has no committed request."
            )
        if not snapshot.image_input.enabled:
            raise ToolExecutionError(
                "Image input is disabled for the calling model. Enable image input in Settings > Models "
                "for a model with documented vision support, then start a new turn.",
                code="IMAGE_INPUT_DISABLED",
            )
        try:
            raw = await self._service.image_preview(arguments.image_id)
            ref = await filesystem_operation(
                lambda cancelled: self._publish(
                    source.session.id,
                    arguments.image_id,
                    raw,
                    snapshot.image_input,
                    call,
                    cancelled,
                )
            )
        except OgeError as error:
            raise oge_tool_error(error) from None
        except AttachmentError as error:
            raise ToolExecutionError(str(error), code=error.code) from None
        except ModelAdapterError as error:
            raise ToolExecutionError(str(error), code=error.code.value) from None
        metadata = {
            "image_id": arguments.image_id,
            "path": attachment_path(ref),
            "preview_only": True,
            "georeferenced": False,
        }
        text = tool_result(metadata)
        return ToolResult(
            content=(*text.content, ImageInputBlock(attachment=ref)), result=text.result
        )

    def _publish(
        self,
        session_id: str,
        image_id: int,
        raw: bytes,
        policy: ModelImageInput,
        call: ToolCall,
        cancelled: Event,
    ) -> ImageAttachment:
        check_cancelled(cancelled, "oge_get_image_preview")
        ref, data = normalize_image(
            str(uuid4()), f"oge-image-{image_id}-preview.png", "image/png", raw
        )
        ref = ref.model_copy(
            update={
                "producer": ToolImageProducer(
                    run_id=call.run_id, tool_call_id=call.call_id
                )
            }
        )
        prepare_image(ref, data, policy)
        check_cancelled(cancelled, "oge_get_image_preview")
        self._attachments.save_batch(
            session_id, (PreparedAttachment(ref, data, raw, "image/png"),)
        )
        check_cancelled(cancelled, "oge_get_image_preview")
        return ref
