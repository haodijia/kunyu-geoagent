"""Model-facing, line-numbered reads over the bound filesystem service."""

import asyncio
from collections.abc import Mapping
from contextlib import closing
from threading import Event

from pydantic import Field

from kunyu.agent.context import build_model_history
from kunyu.agent.runtime.content import TextBlock
from kunyu.agent.runtime.input_content import FileInputBlock
from kunyu.agent.runtime.tools import (
    ToolCall,
    ToolExecutionError,
    ToolResult,
    ToolRiskLevel,
    ToolSpec,
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
    FilesystemScope,
    ReadTarget,
)


class _ReadArguments(ToolArguments):
    file_path: str = Field(min_length=1, max_length=4096)
    offset: int = Field(default=1, ge=1)
    limit: int = Field(default=READ_LIMIT, ge=1, le=READ_LIMIT)


class ReadTool:
    def __init__(
        self, run_id: str, contexts: RunContextRepository, filesystem: Filesystem
    ) -> None:
        self._run_id, self._contexts, self._filesystem = run_id, contexts, filesystem
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
        scope = FilesystemScope(
            source.workspace.id,
            source.session.id,
            tuple(
                block.attachment
                for message in build_model_history(source)
                for block in message.content
                if isinstance(block, FileInputBlock)
            ),
        )
        cancelled = Event()
        try:
            target = self._filesystem.resolve(arguments.file_path, scope)
            return await asyncio.to_thread(self._read, target, arguments, cancelled)
        except FilesystemError as error:
            raise ToolExecutionError(f"{error.code}: {error}") from error
        finally:
            cancelled.set()

    def _read(
        self, target: ReadTarget, arguments: _ReadArguments, cancelled: Event
    ) -> ToolResult:
        with closing(self._filesystem.stream_text(target, cancelled)) as chunks:
            window = build_window(
                chunks, arguments.offset, arguments.limit, target.display_path
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
