"""Foreground argv-only processes with bounded capture and drained cancellation."""

import asyncio
import logging
import os
import signal
import sys
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ProcessOutput:
    exit_code: int
    stdout: bytes
    stderr: bytes
    stdout_truncated: bool
    stderr_truncated: bool


class LocalSubprocess:
    async def run(
        self,
        argv: tuple[str, ...],
        cwd: int,
        *,
        stdout_max_bytes: int,
        stderr_max_bytes: int,
        grace_seconds: float = 3,
    ) -> ProcessOutput:
        if (
            not argv
            or type(cwd) is not int
            or cwd < 0
            or min(stdout_max_bytes, stderr_max_bytes) <= 0
            or grace_seconds < 0
        ):
            raise ValueError("Invalid foreground process specification.")
        # Shield creation: cancellation must still acquire and terminate the child.
        launch = asyncio.create_task(
            asyncio.create_subprocess_exec(
                sys.executable,
                "-m",
                "kunyu.integrations.process_entry",
                str(cwd),
                *argv,
                # The helper fchdir runs in its own process. Python preexec_fn
                # would run after fork in a multithreaded parent and can deadlock.
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=True,
                pass_fds=(cwd,),
            )
        )
        try:
            process = await asyncio.shield(launch)
        except asyncio.CancelledError:

            async def finish_launch() -> None:
                try:
                    child = await launch
                except Exception:
                    logger.exception(
                        "Foreground process launch failed during cancellation"
                    )
                    return  # No process was created; the caller still receives cancellation.
                assert child.stdout is not None and child.stderr is not None
                out = asyncio.create_task(
                    _capture(child.stdout, stdout_max_bytes, tail=False)
                )
                err = asyncio.create_task(
                    _capture(child.stderr, stderr_max_bytes, tail=True)
                )
                await self._terminate(child, grace_seconds)
                await asyncio.gather(out, err)

            await _drain(asyncio.create_task(finish_launch()))
            raise
        assert process.stdout is not None and process.stderr is not None
        stdout = asyncio.create_task(
            _capture(process.stdout, stdout_max_bytes, tail=False)
        )
        stderr = asyncio.create_task(
            _capture(process.stderr, stderr_max_bytes, tail=True)
        )
        completion = asyncio.create_task(process.wait())

        async def collect() -> ProcessOutput:
            code = await completion
            out, err = await asyncio.gather(stdout, stderr)
            return ProcessOutput(code, out[0], err[0], out[1], err[1])

        collected = asyncio.create_task(collect())
        try:
            return await asyncio.shield(collected)
        finally:
            # Kill the process group even if its leader exited with children alive.
            async def cleanup() -> None:
                await self._terminate(process, grace_seconds)
                await collected

            await _drain(asyncio.create_task(cleanup()))

    @staticmethod
    async def _terminate(process: asyncio.subprocess.Process, grace: float) -> None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        try:
            await asyncio.wait_for(process.wait(), grace)
        except TimeoutError:
            pass  # Escalate the entire process group below.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass  # The process group already exited.
        await process.wait()


async def _capture(
    stream: asyncio.StreamReader, cap: int, *, tail: bool
) -> tuple[bytes, bool]:
    kept = bytearray()
    seen = 0
    while chunk := await stream.read(64 * 1024):
        seen += len(chunk)
        if tail:
            kept.extend(chunk)
            if len(kept) > cap:
                del kept[:-cap]
        else:
            kept.extend(chunk[: max(0, cap - len(kept))])
    return bytes(kept), seen > cap


async def _drain(task: asyncio.Task) -> None:
    cancelled = False
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            cancelled = True
            continue
    task.result()
    if cancelled:
        raise asyncio.CancelledError
