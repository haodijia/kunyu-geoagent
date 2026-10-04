"""Read an admitted image as a new, durable multimodal tool occurrence."""

import asyncio
from collections.abc import Mapping

from pydantic import Field

from kunyu.agent.context import build_model_history
from kunyu.agent.runtime.content import TextBlock
from kunyu.agent.runtime.input_content import ImageInputBlock
from kunyu.agent.runtime.models import ModelAdapterError
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
    validate_arguments,
    validate_model,
)
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.attachments import AttachmentError, ImageAttachment
from kunyu.integrations.model.request_images import prepare_image
from kunyu.persistence.attachments import SQLAlchemyAttachmentStore


class _ImageReadArguments(ToolArguments):
    attachment_id: str = Field(min_length=36, max_length=36)


class ReadImageTool:
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        attachments: SQLAlchemyAttachmentStore,
    ) -> None:
        self._run_id, self._contexts, self._attachments = run_id, contexts, attachments
        self.spec = ToolSpec(
            name="read_image",
            description=(
                "Read an admitted image by its attachment_id and return its pixels to the "
                "current model. Use this to inspect an image omitted from earlier context. "
                "Requires the exact calling model to declare image input. The reference "
                "must already appear in this run's current history."
            ),
            parameters=_ImageReadArguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="context",
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, _ImageReadArguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        arguments = validate_model(self.spec.name, _ImageReadArguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        snapshot = source.run.request_snapshot
        if snapshot is None:
            raise ToolExecutionError(
                "The calling model route has no committed request."
            )
        if not snapshot.image_input.enabled:
            raise ToolExecutionError(
                f"Model '{snapshot.model_id}' does not declare image input; "
                "select an image-capable model before reading images."
            )
        visible = {
            block.attachment.id: block.attachment
            for message in build_model_history(source)
            for block in message.content
            if isinstance(block, ImageInputBlock)
        }
        ref = visible.get(arguments.attachment_id)
        if ref is None:
            raise ToolExecutionError(
                "The image attachment was not admitted into this run's current history."
            )
        try:
            stored, data = await asyncio.to_thread(
                self._attachments.read, source.session.id, ref.id
            )
            if stored != ref:
                raise ToolExecutionError(
                    "The image receipt differs from committed history."
                )
            # Enforce the same decode, geometry and per-image limit as the next request.
            await asyncio.to_thread(prepare_image, ref, data, snapshot.image_input)
        except (AttachmentError, ModelAdapterError) as error:
            raise ToolExecutionError(str(error)) from error
        return ToolResult(
            content=(TextBlock(text=_image_text(ref)), ImageInputBlock(attachment=ref)),
            result={"name": ref.name},
        )


def _image_text(ref: ImageAttachment) -> str:
    dimensions = f"{ref.width}x{ref.height}px"
    if (ref.original_width, ref.original_height) != (ref.width, ref.height):
        dimensions += (
            f" (normalized from {ref.original_width}x{ref.original_height}px; "
            f"multiply normalized x coordinates by {ref.original_width / ref.width:.6g} "
            f"and y coordinates by {ref.original_height / ref.height:.6g} "
            "to map them to the original image)"
        )
    return (
        f"Read image: {ref.name!r}\n"
        f"attachment_id={ref.id}\n{ref.media_type}, {dimensions}, {ref.bytes} bytes"
    )
