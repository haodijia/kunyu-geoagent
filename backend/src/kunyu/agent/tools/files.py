"""Model-facing, line-numbered reads over the bound filesystem service."""

from collections.abc import Mapping
from contextlib import closing
from threading import Event

from pydantic import Field

from kunyu.agent.filesystem import FilesystemHooks
from kunyu.agent.runtime.content import TextBlock
from kunyu.agent.runtime.tools import (
    ToolCall,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
)
from kunyu.agent.scope import AgentScopes
from kunyu.agent.tools.files_shared import (
    filesystem_scope,
    tool_filesystem_error,
)
from kunyu.agent.tools.read_render import (
    READ_LIMIT,
    build_window,
    format_read_output,
    lang_from_path,
)
from kunyu.agent.tools.shared import (
    ToolArguments,
    load_source,
    require_bound_call,
    validate_arguments,
    validate_model,
)
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.filesystem import (
    Filesystem,
    FilesystemError,
    FsInfo,
    FsObservation,
    FsTarget,
)
from kunyu.integrations.filesystem_operation import filesystem_operation


class _ReadArguments(ToolArguments):
    file_path: str = Field(min_length=1, max_length=4096)
    offset: int = Field(default=1, ge=1)
    limit: int = Field(default=READ_LIMIT, ge=1, le=READ_LIMIT)


class ReadTool:
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        filesystem: Filesystem,
        hooks: FilesystemHooks,
        scopes: AgentScopes,
    ) -> None:
        self._run_id, self._contexts, self._filesystem = run_id, contexts, filesystem
        self._hooks, self._scopes = hooks, scopes
        self.spec = ToolSpec(
            name="read",
            description="Read a UTF-8 text file and return line-numbered content. Paths resolve relative to /workspace; admitted file attachments use their exact /attachments path. Offset is the 1-based first line, default 1. Limit defaults to 2000 lines. Results cap each line to 2000 UTF-16 characters and selected text to 50 KiB; use the reported offset to continue. Binary files require a dedicated reader.",
            parameters=_ReadArguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="context",
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, _ReadArguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        arguments = validate_model(self.spec.name, _ReadArguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        actor = self._scopes.for_session(source.session.id)
        path = arguments.file_path
        try:
            target = self._filesystem.resolve(path, filesystem_scope(source))
            path = target.display_path
            info = await filesystem_operation(
                lambda cancelled: self._filesystem.stat(target, cancelled)
            )
            if info is None:
                self._hooks.observe(target, FsObservation("absent"), actor)
                raise FilesystemError(
                    "FS_NOT_FOUND", f'cannot read "{path}": not found'
                )
            if info.kind != "file":
                raise FilesystemError(
                    "FS_NOT_REGULAR_FILE", f'cannot read "{path}": not a regular file'
                )
            result = await filesystem_operation(
                lambda cancelled: self._read(target, info, arguments, cancelled)
            )
            self._hooks.observe(target, FsObservation("present", info.version), actor)
            return result
        except FilesystemError as error:
            raise tool_filesystem_error(error, path) from error

    def _read(
        self,
        target: FsTarget,
        info: FsInfo,
        arguments: _ReadArguments,
        cancelled: Event,
    ) -> ToolResult:
        if info.size is None or info.size >= 10 * 1024 * 1024:
            with closing(self._filesystem.stream_text(target, cancelled)) as chunks:
                window = build_window(
                    chunks, arguments.offset, arguments.limit, target.display_path
                )
        else:
            window = build_window(
                (self._filesystem.read_text(target, cancelled),),
                arguments.offset,
                arguments.limit,
                target.display_path,
            )
        value = {
            "path": target.display_path,
            "offset": window.offset,
            "lines": [
                {"number": line.number, "text": line.text} for line in window.lines
            ],
            "total_lines": window.total_lines,
            "truncated_by_bytes": window.truncated_by_bytes,
        }
        language = lang_from_path(target.display_path)
        if language is not None:
            value["lang"] = language
        return ToolResult(
            content=(TextBlock(text=format_read_output(target.display_path, window)),),
            result=value,
        )
