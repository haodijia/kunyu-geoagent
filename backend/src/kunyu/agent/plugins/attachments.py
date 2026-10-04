"""Expose the admitted attachment reader through the existing scoped registry."""

from functools import partial

from kunyu.agent import services as s
from kunyu.agent.scope import Context
from kunyu.agent.tools.files import FileReadTool
from kunyu.agent.tools.registry import ToolRegistration


class AttachmentToolsPlugin:
    name = "attachment-tools"
    requires = (s.TOOLS, s.CONTEXTS, s.ATTACHMENTS)
    provides = ()

    async def apply(self, context: Context) -> None:
        context.require(s.TOOLS).register(
            context,
            "file_read",
            ToolRegistration(
                partial(
                    FileReadTool,
                    contexts=context.require(s.CONTEXTS),
                    attachments=context.require(s.ATTACHMENTS),
                )
            ),
        )
