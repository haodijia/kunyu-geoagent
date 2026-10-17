"""Current-history filesystem scope and model-facing error presentation."""

from kunyu.agent.context.history import build_model_history
from kunyu.agent.runtime.contracts.input_content import FileInputBlock, ImageInputBlock
from kunyu.agent.runtime.contracts.tools import ToolExecutionError
from kunyu.domain.conversation.agent_context import RunContextSource
from kunyu.domain.workspaces.filesystem import FilesystemError, FilesystemScope


def filesystem_scope(source: RunContextSource) -> FilesystemScope:
    return FilesystemScope(
        source.workspace.id,
        source.session.id,
        tuple(
            block.attachment
            for message in build_model_history(source)
            for block in message.content
            if isinstance(block, (FileInputBlock, ImageInputBlock))
        ),
    )


def tool_filesystem_error(error: FilesystemError, path: str) -> ToolExecutionError:
    message = str(error)
    if error.code == "FS_NOT_OBSERVED":
        message = f'cannot modify "{path}": file has not been read — read the file, then retry'
    elif error.code == "FS_STALE_VERSION":
        message += " — re-read the file, then retry"
    return ToolExecutionError(f"{error.code}: {message}", code=error.code)
