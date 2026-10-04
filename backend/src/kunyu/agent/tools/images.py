"""Read scoped image files and publish durable model-visible image receipts."""

from collections.abc import Mapping
from contextlib import closing
from pathlib import PurePosixPath
from threading import Event
from uuid import uuid4

from pydantic import Field

from kunyu.agent.filesystem import FilesystemHooks
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
from kunyu.agent.scope import AgentScopes
from kunyu.agent.tools.files_shared import filesystem_scope, tool_filesystem_error
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    validate_arguments,
    validate_model,
)
from kunyu.application.attachment_preparation import PreparedAttachment, normalize_image
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.attachments import (
    MAX_ATTACHMENT_BYTES,
    AttachmentError,
    ImageAttachment,
    ToolImageProducer,
)
from kunyu.domain.filesystem import (
    Filesystem,
    FilesystemError,
    FsInfo,
    FsObservation,
    FsTarget,
)
from kunyu.domain.model_images import ModelImageInput
from kunyu.integrations.filesystem_io import check_cancelled
from kunyu.integrations.filesystem_operation import filesystem_operation
from kunyu.integrations.model.request_images import prepare_image
from kunyu.persistence.attachments import SQLAlchemyAttachmentStore

IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


class _ImageReadArguments(ToolArguments):
    file_path: str = Field(min_length=1, max_length=4096)


class ReadImageTool:
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
            description="Read a PNG/JPEG/WebP/GIF file and return the image itself. Paths resolve relative to /workspace; admitted attachments use their exact /attachments path, including omitted images. Extension-less image paths are identified from their bytes. Large supported images are normalized before the next model request; use this directly instead of creating thumbnails just to inspect pixels. Requires the exact calling model to declare image input. Independent files may be read concurrently in small batches.",
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
                f"Model '{snapshot.model_id}' does not declare image input; select an image-capable model before reading images."
            )
        path = arguments.file_path
        actor = self._scopes.for_session(source.session.id)
        try:
            target = self._filesystem.resolve(path, filesystem_scope(source))
            path = target.display_path
            existing = (
                target.attachment
                if isinstance(target.attachment, ImageAttachment)
                else None
            )
            extension = PurePosixPath(path).suffix.lower()
            if existing is None and extension and extension not in IMAGE_TYPES:
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
        if isinstance(target.attachment, ImageAttachment):
            ref, normalized = target.attachment, raw
        else:
            media_type = IMAGE_TYPES.get(
                PurePosixPath(target.display_path).suffix.lower()
            )
            if media_type is None:
                media_type = _sniff_type(raw)
            if media_type is None:
                raise FilesystemError(
                    "FS_NOT_IMAGE",
                    "The bytes are not a supported PNG/JPEG/WebP/GIF image.",
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
        if target.attachment is None or not isinstance(
            target.attachment, ImageAttachment
        ):
            self._attachments.save_batch(
                target.scope.session_id,
                (PreparedAttachment(ref, normalized, raw, media_type),),
            )
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
            f"multiply coordinates by {x}"
            if x == y
            else f"multiply x coordinates by {x} and y coordinates by {y}"
        )
        scaled = f" (downscaled from {ref.original_width}x{ref.original_height} px; {advice} to locate features in the original file)"
    return f"<path>{path}</path>\n<type>image</type>\n<content>\n{ref.media_type} image, {ref.width}x{ref.height} px, {ref.bytes} bytes{scaled}\n</content>"
