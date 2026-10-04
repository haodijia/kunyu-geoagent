"""Read UTF-8 file attachments admitted into the current model history."""

import asyncio
from collections.abc import Mapping

from pydantic import Field

from kunyu.agent.context import build_model_history
from kunyu.agent.runtime.input_content import FileInputBlock
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
from kunyu.domain.agent_context import RunContextRepository
from kunyu.domain.attachments import AttachmentError
from kunyu.persistence.attachments import SQLAlchemyAttachmentStore


class _FileReadArguments(ToolArguments):
    attachment_id: str = Field(min_length=36, max_length=36)
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=2000, ge=1, le=2000)


class FileReadTool:
    def __init__(
        self,
        run_id: str,
        contexts: RunContextRepository,
        attachments: SQLAlchemyAttachmentStore,
    ) -> None:
        self._run_id = run_id
        self._contexts = contexts
        self._attachments = attachments
        self.spec = ToolSpec(
            name="file_read",
            description="Read an admitted UTF-8 file attachment by its attachment_id. Offset and limit count Unicode characters; next_offset continues the file. Binary files require a dedicated reader.",
            parameters=_FileReadArguments.model_json_schema(),
            risk_level=ToolRiskLevel.L0,
            execution="parallel",
            presentation="context",
        )

    def validate(self, arguments: object) -> Mapping[str, object]:
        return validate_arguments(self.spec.name, _FileReadArguments, arguments)

    async def execute(self, call: ToolCall) -> ToolResult:
        require_bound_call(call, self._run_id, self.spec.name)
        arguments = validate_model(self.spec.name, _FileReadArguments, call.arguments)
        source = load_source(self._contexts, self._run_id)
        visible = {
            block.attachment.id: block.attachment
            for message in build_model_history(source)
            for block in message.content
            if isinstance(block, FileInputBlock)
        }
        ref = visible.get(arguments.attachment_id)
        if ref is None:
            raise ToolExecutionError(
                "The file attachment was not admitted into this run's history."
            )
        try:
            stored, data = await asyncio.to_thread(
                self._attachments.read, source.session.id, ref.id
            )
            if stored != ref:
                raise ToolExecutionError(
                    "The file receipt differs from committed history."
                )
            text = data.decode("utf-8", errors="strict")
            if "\x00" in text:
                raise ToolExecutionError(
                    "Binary attachments cannot be read as UTF-8 text."
                )
        except UnicodeDecodeError as error:
            raise ToolExecutionError("The attachment is not UTF-8 text.") from error
        except AttachmentError as error:
            raise ToolExecutionError(str(error)) from error
        if arguments.offset > len(text):
            raise ToolExecutionError(
                "The requested character offset exceeds the file length."
            )
        end = min(len(text), arguments.offset + arguments.limit)
        return tool_result(
            {
                "attachment_id": ref.id,
                "name": ref.name,
                "offset": arguments.offset,
                "content": text[arguments.offset : end],
                "total_characters": len(text),
                "next_offset": end if end < len(text) else None,
            }
        )
