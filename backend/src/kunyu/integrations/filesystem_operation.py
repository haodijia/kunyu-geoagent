"""Drained asynchronous ownership of cancellable filesystem worker operations."""

import asyncio
import logging
from collections.abc import Callable
from threading import Event

from anyio import CancelScope

from kunyu.domain.filesystem import FilesystemError

logger = logging.getLogger(__name__)


async def filesystem_operation[T](operation: Callable[[Event], T]) -> T:
    cancelled = Event()
    worker = asyncio.create_task(asyncio.to_thread(operation, cancelled))
    try:
        return await asyncio.shield(worker)
    except asyncio.CancelledError:
        cancelled.set()
        # Publication checks the flag. Drain the native worker before releasing
        # its run; a second cancellation must not leave it modifying files later.
        with CancelScope(shield=True):
            while not worker.done():
                try:
                    await asyncio.shield(worker)
                except asyncio.CancelledError:
                    continue
                except FilesystemError:
                    break  # Inspect the worker's terminal error below.
                except Exception:
                    logger.exception(
                        "Filesystem worker failed while draining cancellation"
                    )
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
