"""Current-history filesystem scope and drained cancellable worker operations."""

import asyncio
import logging
from collections.abc import Callable
from threading import Event

from kunyu.agent.context import build_model_history
from kunyu.agent.runtime.input_content import FileInputBlock
from kunyu.agent.runtime.tools import ToolExecutionError
from kunyu.domain.agent_context import RunContextSource
from kunyu.domain.filesystem import FilesystemError, FilesystemScope

logger = logging.getLogger(__name__)


def filesystem_scope(source: RunContextSource) -> FilesystemScope:
    return FilesystemScope(
        source.workspace.id,
        source.session.id,
        tuple(
            block.attachment
            for message in build_model_history(source)
            for block in message.content
            if isinstance(block, FileInputBlock)
        ),
    )


def tool_filesystem_error(error: FilesystemError, path: str) -> ToolExecutionError:
    message = str(error)
    if error.code == "FS_NOT_OBSERVED":
        message = f'cannot modify "{path}": file has not been read — read the file, then retry'
    elif error.code == "FS_STALE_VERSION":
        message += " — re-read the file, then retry"
    return ToolExecutionError(f"{error.code}: {message}", code=error.code)


async def filesystem_operation[T](operation: Callable[[Event], T]) -> T:
    cancelled = Event()
    worker = asyncio.create_task(asyncio.to_thread(operation, cancelled))
    try:
        return await asyncio.shield(worker)
    except asyncio.CancelledError:
        cancelled.set()
        # Publication checks the flag. Drain the native worker before releasing
        # its run; a second cancellation must not leave it modifying files later.
        while not worker.done():
            try:
                await asyncio.shield(worker)
            except asyncio.CancelledError:
                continue
            except FilesystemError:
                break  # Inspect the worker's terminal error below.
            except Exception:
                logger.exception("Filesystem worker failed while draining cancellation")
                break
        try:
            worker.result()
        except FilesystemError as error:
            if error.code != "FS_ABORTED":
                logger.warning("Cancelled filesystem operation failed: %s", error)
        except Exception:
            logger.exception("Cancelled filesystem worker failed")
        raise
    finally:
        cancelled.set()
