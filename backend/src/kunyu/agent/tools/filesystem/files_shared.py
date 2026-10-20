"""Run-owned filesystem scope and model-facing error presentation."""

from kunyu.agent.runtime.contracts.tools import ToolExecutionError
from kunyu.domain.conversation.agent_context import RunContextRepository
from kunyu.domain.workspaces.filesystem import FilesystemError, FilesystemScope


def filesystem_scope(contexts: RunContextRepository, run_id: str) -> FilesystemScope:
    scope = contexts.get_filesystem_scope(run_id)
    if scope is None:
        raise ToolExecutionError("The tool call references an unknown run.")
    return scope


def tool_filesystem_error(error: FilesystemError, path: str) -> ToolExecutionError:
    message = str(error)
    if error.code == "FS_NOT_OBSERVED":
        message = f'cannot modify "{path}": file has not been read — read the file, then retry'
    elif error.code == "FS_STALE_VERSION":
        message += " — re-read the file, then retry"
    return ToolExecutionError(f"{error.code}: {message}", code=error.code)
