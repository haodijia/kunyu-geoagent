"""Native process capture and cancellation, including Windows descendant cleanup."""

import asyncio
import ctypes
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

from kunyu.integrations.process.subprocess import LocalSubprocess


@unittest.skipUnless(os.name == "nt", "Windows native job and process checks")
class SearchProcessTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        temporary_root = Path(__file__).resolve().parents[2] / ".tmp"
        temporary_root.mkdir(exist_ok=True)
        temporary = tempfile.TemporaryDirectory(
            prefix="kunyu-process-", dir=temporary_root
        )
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.runner = LocalSubprocess()

    async def run_command(self, code, **kwargs):
        return await self.runner.run(
            (sys.executable, "-c", code),
            self.root,
            stdout_max_bytes=32,
            stderr_max_bytes=32,
            **kwargs,
        )

    async def test_windows_cwd_exit_status_and_bounded_capture(self):
        result = await self.run_command("import os; print(os.getcwd())")
        self.assertEqual(result.exit_code, 0)
        self.assertTrue(result.stdout.startswith(str(self.root).encode()[:32]))
        result = await self.run_command(
            "import sys; sys.stdout.write('x'*1000); sys.stderr.write('y'*1000); sys.exit(7)"
        )
        self.assertEqual(result.exit_code, 7)
        self.assertEqual(result.stdout, b"x" * 32)
        self.assertEqual(result.stderr, b"y" * 32)
        self.assertTrue(result.stdout_truncated)
        self.assertTrue(result.stderr_truncated)

    async def test_cancellation_kills_command_and_grandchild(self):
        pids = self.root / "pids.json"
        code = (
            "import os,subprocess,sys,time,json,pathlib; "
            "child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)'],"
            "stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); "
            f"pathlib.Path({str(pids)!r}).write_text(json.dumps([os.getpid(),child.pid])); "
            "time.sleep(60)"
        )
        task = asyncio.create_task(self.run_command(code))
        deadline = asyncio.get_running_loop().time() + 10
        while not pids.exists():
            if task.done():
                self.fail(f"Probe exited before becoming ready: {await task}")
            self.assertLess(asyncio.get_running_loop().time(), deadline)
            await asyncio.sleep(0.01)
        from kunyu.integrations.process.windows import kernel32

        handles = [
            kernel32.OpenProcess(0x00100000, False, pid)
            for pid in json.loads(pids.read_text())
        ]
        self.assertTrue(all(handles))
        kernel32.WaitForSingleObject.argtypes = (ctypes.c_void_p, ctypes.c_ulong)
        kernel32.WaitForSingleObject.restype = ctypes.c_ulong
        try:
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await asyncio.wait_for(task, 5)
            for handle in handles:
                self.assertEqual(kernel32.WaitForSingleObject(handle, 2000), 0)
        finally:
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
            for handle in handles:
                kernel32.CloseHandle(handle)

    async def test_cancel_during_launch_is_drained_even_when_cancelled_twice(self):
        original = self.runner._launch
        ready, release = asyncio.Event(), asyncio.Event()
        launched = []

        async def gated(argv, cwd):
            process, job = await original(argv, cwd)
            launched.append((process, job))
            ready.set()
            await release.wait()
            return process, job

        self.runner._launch = gated
        task = asyncio.create_task(self.run_command("import time; time.sleep(60)"))
        try:
            await asyncio.wait_for(ready.wait(), 5)
            task.cancel()
            await asyncio.sleep(0)
            task.cancel()
            release.set()
            with self.assertRaises(asyncio.CancelledError):
                await asyncio.wait_for(task, 5)
            self.assertIsNotNone(launched[0][0].returncode)
            self.assertIsNone(launched[0][1].handle)
        finally:
            release.set()
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)


if __name__ == "__main__":
    unittest.main()
