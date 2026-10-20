"""Read scoped image files and publish durable model-visible image receipts."""

from collections.abc import Mapping
from contextlib import closing
from pathlib import PurePosixPath
from threading import Event
from uuid import uuid4

from pydantic import Field

from kunyu.agent.capabilities.filesystem import FilesystemHooks
from kunyu.agent.core.scope import AgentScopes
from kunyu.agent.prompts.loader import prompt_text, tool_description
from kunyu.agent.runtime.contracts.content import TextBlock
from kunyu.agent.runtime.contracts.input_content import ImageInputBlock
from kunyu.agent.runtime.contracts.models import ModelAdapterError
from kunyu.agent.runtime.contracts.tools import (
    BaseTool,
    ToolCall,
    ToolExecutionError,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.tools.filesystem.files_shared import (
    filesystem_scope,
    tool_filesystem_error,
)
from kunyu.agent.tools.outputs.filesystem import IMAGE
from kunyu.agent.tools.shared import (
    ToolArguments,
    require_bound_call,
    validate_arguments,
    validate_model,
)
from kunyu.application.conversation.attachment_preparation import normalize_image
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.conversation.attachments import (
    MAX_ATTACHMENT_BYTES,
    AttachmentError,
    ImageAttachment,
    PreparedAttachment,
    ToolImageProducer,
)
from kunyu.domain.models.model_images import ModelImageInput
from kunyu.domain.workspaces.filesystem import (
    Filesystem,
    FilesystemError,
    FsInfo,
    FsObservation,
    FsTarget,
)
from kunyu.integrations.filesystem.io import check_cancelled
from kunyu.integrations.filesystem.operation import filesystem_operation
from kunyu.integrations.model.request_images import prepare_image
from kunyu.persistence.conversation.attachments import SQLAlchemyAttachmentStore

IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


class _ImageReadArguments(ToolArguments):
    file_path: str = Field(min_length=1, max_length=4096)


class ReadImageTool(BaseTool):
    output_contract = IMAGE

    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        attachments: SQLAlchemyAttachmentStore,
        filesystem: Filesystem,
        hooks: FilesystemHooks,
        scopes: AgentScopes,
    ) -> None:
        self._run_id, self._contexts, self._attachments = run_id, contexts, attachments
        self._filesystem, self._hooks, self._scopes = filesystem, hooks, scopes
        self.spec = ToolSpec(
            name="read_image",
            description=tool_description("read_image"),
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
        scope = filesystem_scope(self._contexts, self._run_id)
        snapshot = self._contexts.get_request_snapshot(self._run_id)
        if snapshot is None:
            raise ToolExecutionError(
                "The calling model route has no committed request."
            )
        if not snapshot.image_input.enabled:
            raise ToolExecutionError(
                f"Image input is disabled in the saved settings for model '{snapshot.model_id}'. "
                "No image was sent to the provider. Enable image input in Settings > Models > "
                "Model parameters only if the provider documents vision support for this exact model, "
                "then send a new message; the current run keeps its original settings.",
                code="IMAGE_INPUT_DISABLED",
            )
        path = arguments.file_path
        actor = self._scopes.for_session(scope.session_id)
        try:
            target = self._filesystem.resolve(path, scope)
            path = target.display_path
            extension = PurePosixPath(path).suffix.lower()
            if extension and extension not in IMAGE_TYPES:
                raise FilesystemError(
                    "FS_NOT_IMAGE",
                    "read_image accepts PNG/JPEG/WebP/GIF files, including extension-less images.",
                )
            info = await filesystem_operation(
                lambda cancelled: self._filesystem.stat(target, cancelled)
            )
            if info is None:
                self._hooks.observe(target, FsObservation("absent"), actor)
                raise FilesystemError(
                    "FS_NOT_FOUND", f'cannot read "{path}": not found'
                )
            if info.kind != "file" or info.size is None:
                raise FilesystemError(
                    "FS_NOT_REGULAR_FILE", f'cannot read "{path}": not a regular file'
                )
            ref = await filesystem_operation(
                lambda cancelled: self._read(
                    target, info, snapshot.image_input, call, cancelled
                )
            )
            self._hooks.observe(target, FsObservation("present", info.version), actor)
            return ToolResult(
                content=(
                    TextBlock(text=_image_text(path, ref)),
                    ImageInputBlock(attachment=ref),
                ),
                result={"path": path},
            )
        except FilesystemError as error:
            raise tool_filesystem_error(error, path) from error
        except (AttachmentError, ModelAdapterError) as error:
            raise ToolExecutionError(
                str(error),
                code=error.code.value
                if isinstance(error, ModelAdapterError)
                else error.code,
            ) from error

    def _read(
        self,
        target: FsTarget,
        info: FsInfo,
        policy: ModelImageInput,
        call: ToolCall,
        cancelled: Event,
    ) -> ImageAttachment:
        if info.size > MAX_ATTACHMENT_BYTES:
            raise FilesystemError(
                "FS_TOO_LARGE", "Image source exceeds the 16 MiB read limit."
            )
        data = bytearray()
        with closing(self._filesystem.stream_bytes(target, cancelled)) as chunks:
            for chunk in chunks:
                if len(data) + len(chunk) > MAX_ATTACHMENT_BYTES:
                    raise FilesystemError(
                        "FS_TOO_LARGE", "Image source exceeds the 16 MiB read limit."
                    )
                data.extend(chunk)
        current = self._filesystem.stat(target, cancelled)
        if current != info or len(data) != info.size:
            raise FilesystemError(
                "FS_STALE_VERSION", "The image changed while reading it."
            )
        raw = bytes(data)
        media_type = IMAGE_TYPES.get(PurePosixPath(target.display_path).suffix.lower())
        if media_type is None:
            media_type = _sniff_type(raw)
        if media_type is None:
            raise FilesystemError(
                "FS_NOT_IMAGE", "The bytes are not a supported PNG/JPEG/WebP/GIF image."
            )
        ref, normalized = normalize_image(
            str(uuid4()), PurePosixPath(target.display_path).name, media_type, raw
        )
        ref = ref.model_copy(
            update={
                "producer": ToolImageProducer(
                    run_id=call.run_id, tool_call_id=call.call_id
                )
            }
        )
        check_cancelled(cancelled, "read_image")
        prepare_image(ref, normalized, policy)
        check_cancelled(cancelled, "read_image")
        ref = self._attachments.save_batch(
            target.scope.session_id,
            (PreparedAttachment(ref, normalized, raw, media_type),),
        )[0]
        check_cancelled(cancelled, "read_image")
        return ref


def _sniff_type(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _image_text(path: str, ref: ImageAttachment) -> str:
    scaled = ""
    if (ref.original_width, ref.original_height) != (ref.width, ref.height):
        x, y = (
            f"{ref.original_width / ref.width:.2f}",
            f"{ref.original_height / ref.height:.2f}",
        )
        advice = (
            prompt_text("tool-results.yaml", "image_scaled_uniform", scale=x)
            if x == y
            else prompt_text(
                "tool-results.yaml", "image_scaled_axes", scale_x=x, scale_y=y
            )
        )
        scaled = " " + prompt_text(
            "tool-results.yaml",
            "image_scaled",
            width=str(ref.original_width),
            height=str(ref.original_height),
            advice=advice,
        )
    return f"<path>{path}</path>\n<type>image</type>\n<content>\n{ref.media_type} image, {ref.width}x{ref.height} px, {ref.bytes} bytes{scaled}\n</content>"
