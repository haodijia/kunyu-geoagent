"""Native target watches, current metadata and owned worker teardown."""

import asyncio
import logging
from builtins import BaseExceptionGroup
from collections.abc import AsyncGenerator, Callable
from pathlib import Path
from threading import Event, Thread

from anyio import CancelScope
from watchfiles._rust_notify import RustNotify

from kunyu.domain.filesystem import (
    FilesystemError,
    FsInfo,
    FsObservation,
    FsTarget,
    FsWatchFrame,
)
from kunyu.integrations.filesystem_io import open_directory, open_parent

logger = logging.getLogger(__name__)
type Stat = Callable[[FsTarget, Event], FsInfo | None]


class FilesystemWatches:
    def __init__(self, root: Path, stat: Stat) -> None:
        self._root = root
        self._stat = stat
        self._followers: set[_Follower] = set()
        self._closed = False

    def observed(
        self, target: FsTarget, observation: FsObservation, actor: object
    ) -> None:
        for follower in tuple(self._followers):
            if target.scope.workspace_id == follower.target.scope.workspace_id:
                path = target.display_path
                if path == follower.target.display_path or (
                    follower.directory
                    and path.rsplit("/", 1)[0] == follower.target.display_path
                ):
                    follower.loop.call_soon_threadsafe(follower.wake.set)

    async def follow(self, target: FsTarget) -> AsyncGenerator[FsWatchFrame, None]:
        if self._closed:
            raise FilesystemError(
                "FS_WATCH_CLOSED", "The filesystem service is closing."
            )
        if target.kind != "workspace":
            raise FilesystemError(
                "FS_WATCH_UNSUPPORTED", "Immutable attachment receipts are not watched."
            )
        follower = _Follower(self._root, target, self._stat)
        self._followers.add(follower)
        try:
            await follower.initialized.wait()
            if follower.error is not None:
                raise follower.error
            if follower.stopped.is_set():
                return
            yield FsWatchFrame(target.display_path, "ready", follower.info)
            while not follower.stopped.is_set():
                await follower.wake.wait()
                follower.wake.clear()
                if follower.error is not None:
                    raise follower.error
                if follower.stopped.is_set():
                    return
                info = await follower.metadata(self._stat)
                yield FsWatchFrame(target.display_path, "change", info)
        finally:
            try:
                await follower.close()
            finally:
                self._followers.discard(follower)

    async def close(self) -> None:
        self._closed = True
        outcomes = await asyncio.gather(
            *(follower.close() for follower in tuple(self._followers)),
            return_exceptions=True,
        )
        self._followers.clear()
        failures = [
            outcome for outcome in outcomes if isinstance(outcome, BaseException)
        ]
        if failures:
            raise BaseExceptionGroup("Closing filesystem watches failed", failures)


class _Follower:
    def __init__(self, root: Path, target: FsTarget, stat: Stat) -> None:
        self.target = target
        self.loop = asyncio.get_running_loop()
        self.stopped = Event()
        self.initialized = asyncio.Event()
        self.wake = asyncio.Event()
        self.directory = False
        self.info: FsInfo | None = None
        self.error: FilesystemError | None = None
        self.reader: asyncio.Task[FsInfo | None] | None = None
        self.worker: asyncio.Future[None] = self.loop.create_future()
        self.thread = Thread(
            target=self._work, args=(root, stat), name="kunyu-file-watch"
        )
        try:
            self.thread.start()
        except RuntimeError as error:
            raise FilesystemError("FS_WATCH_FAILED", str(error)) from error

    def _settle(self, error: BaseException | None) -> None:
        if error is None:
            self.worker.set_result(None)
        else:
            self.worker.set_exception(error)

    def _work(self, root: Path, stat: Stat) -> None:
        error = None
        try:
            self._run(root, stat)
        except BaseException as failure:
            logger.exception(
                "Native watch worker failed for %s", self.target.display_path
            )
            error = failure
        finally:
            self.loop.call_soon_threadsafe(self._settle, error)

    def _ready(self, info: FsInfo | None) -> None:
        self.info = info
        self.initialized.set()

    def _failed(self, error: FilesystemError) -> None:
        self.error = error
        self.initialized.set()
        self.wake.set()

    def _run(self, root: Path, stat: Stat) -> None:
        notifier = None
        try:
            info = stat(self.target, self.stopped)
            self.directory = info is not None and info.kind == "directory"
            if info is not None and info.kind == "other":
                raise FilesystemError(
                    "FS_NOT_REGULAR_FILE",
                    "Symbolic links and special files cannot be watched.",
                )
            native = root / "workspaces" / self.target.scope.workspace_id / "files"
            native = native.joinpath(*self.target.parts)
            manager = (
                open_directory(root, self.target, self.stopped)
                if self.directory
                else open_parent(root, self.target, cancelled=self.stopped)
            )
            with manager:
                paths = (
                    [str(native), str(native.parent)]
                    if self.directory
                    else [str(native.parent)]
                )
                notifier = RustNotify(paths, False, False, 0, False, False)
                # watchfiles can construct Poll on ENOSYS. Never accept that backend.
                if not repr(notifier).startswith("RustNotify(Recommended("):
                    raise FilesystemError(
                        "FS_WATCH_UNSUPPORTED",
                        "Native filesystem notifications are unavailable.",
                    )
                self.loop.call_soon_threadsafe(
                    self._ready, stat(self.target, self.stopped)
                )
                while not self.stopped.is_set():
                    changes = notifier.watch(200, 25, 250, self.stopped)
                    if changes == "timeout":
                        continue
                    if changes == "stop":
                        return
                    if changes == "signal":
                        raise FilesystemError(
                            "FS_WATCH_FAILED", "The native watcher was interrupted."
                        )
                    if not isinstance(changes, set):
                        raise FilesystemError(
                            "FS_WATCH_FAILED",
                            "The native watcher returned an invalid frame.",
                        )
                    if any(
                        Path(path) == native
                        or (self.directory and Path(path).parent == native)
                        for _, path in changes
                    ):
                        self.loop.call_soon_threadsafe(self.wake.set)
        except FilesystemError as error:
            if not self.stopped.is_set():
                self.loop.call_soon_threadsafe(self._failed, error)
        except Exception as error:
            if not self.stopped.is_set():
                logger.exception("Native watch failed for %s", self.target.display_path)
                self.loop.call_soon_threadsafe(
                    self._failed, FilesystemError("FS_WATCH_FAILED", str(error))
                )
        finally:
            if notifier is not None:
                notifier.close()

    async def metadata(self, stat: Stat) -> FsInfo | None:
        reader = asyncio.create_task(asyncio.to_thread(stat, self.target, self.stopped))
        self.reader = reader
        try:
            return await asyncio.shield(reader)
        finally:
            if reader.done():
                self.reader = None

    async def close(self) -> None:
        self.stopped.set()
        self.initialized.set()
        self.wake.set()
        with CancelScope(shield=True):
            while not self.worker.done():
                try:
                    await asyncio.shield(self.worker)
                except asyncio.CancelledError:
                    continue
                except Exception:
                    logger.exception("Closing native file watch failed")
                    break
            self.thread.join()
            reader = self.reader
            if reader is not None:
                drained = asyncio.gather(reader, return_exceptions=True)
                while not drained.done():
                    try:
                        await asyncio.shield(drained)
                    except asyncio.CancelledError:
                        continue
                outcome = drained.result()[0]
                if isinstance(outcome, BaseException) and not (
                    isinstance(outcome, FilesystemError)
                    and outcome.code == "FS_ABORTED"
                ):
                    logger.error(
                        "Closing file watch metadata failed",
                        exc_info=(type(outcome), outcome, outcome.__traceback__),
                    )
                self.reader = None
            self.worker.result()
