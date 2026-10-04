"""Expose scoped image reads and durable image receipts through the registry."""

from functools import partial

from kunyu.agent import services as s
from kunyu.agent.scope import Context
from kunyu.agent.tools.images import ReadImageTool
from kunyu.agent.tools.registry import ToolRegistration


class AttachmentToolsPlugin:
    name = "attachment-tools"
    requires = (
        s.TOOLS,
        s.CONTEXTS,
        s.ATTACHMENTS,
        s.FILESYSTEM,
        s.FILESYSTEM_HOOKS,
        s.SCOPES,
    )
    provides = ()

    async def apply(self, context: Context) -> None:
        context.require(s.TOOLS).register(
            context,
            "read_image",
            ToolRegistration(
                partial(
                    ReadImageTool,
                    contexts=context.require(s.CONTEXTS),
                    attachments=context.require(s.ATTACHMENTS),
                    filesystem=context.require(s.FILESYSTEM),
                    hooks=context.require(s.FILESYSTEM_HOOKS),
                    scopes=context.require(s.SCOPES),
                )
            ),
        )
