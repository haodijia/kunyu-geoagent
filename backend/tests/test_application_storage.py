"""Native Windows checks through create_app, real lifecycle, API and model/tool dispatch."""

import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from kunyu.main import create_app
from local_model_server import LocalModelServer


class ApplicationStorageTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[2] / ".tmp"
        root.mkdir(exist_ok=True)
        temporary = tempfile.TemporaryDirectory(prefix="kunyu-application-", dir=root)
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        rg = shutil.which("rg")
        if not rg:
            self.skipTest("ripgrep is required for native search validation")
        self.enterContext(
            patch.dict(
                os.environ,
                {
                    "KUNYU_APP_DATA_DIR": str(self.root),
                    "KUNYU_RIPGREP_PATH": rg,
                },
            )
        )
        self.model = LocalModelServer().start()
        self.addCleanup(self.model.close)
        self.client = None
        self.addCleanup(self.stop_app)
        self.start_app()
        self.workspace = self.request(
            "POST", "/api/v1/workspaces", {"name": "Windows 应用入口验证"}
        )["id"]
        self.files = self.root / "workspaces" / self.workspace / "files"
        self.connection = self.request(
            "POST",
            "/api/v1/model-connections",
            {
                "display_name": "Local validation fixture",
                "provider_type": "custom",
                "protocol": "openai_compatible",
                "base_url": self.model.url,
                "auth_mode": "none",
                "max_tokens_field": "max_tokens",
                "include_usage": False,
            },
        )["id"]
        self.request(
            "POST",
            f"/api/v1/model-connections/{self.connection}/manual-models",
            {"model_id": "windows-test"},
        )
        self.request(
            "PATCH",
            f"/api/v1/model-connections/{self.connection}",
            {
                "enabled": True,
                "enabled_model_ids": ["windows-test"],
            },
        )
        checked = self.request(
            "POST",
            f"/api/v1/model-connections/{self.connection}/test",
            {
                "model_id": "windows-test",
                "mode": "tools",
            },
        )
        self.assertNotIn("failed", str(checked).lower(), checked)

    def start_app(self):
        self.client = TestClient(
            create_app("windows-validation"),
            headers={"X-Kunyu-Session": "windows-validation"},
        )
        self.client.__enter__()
        self.assertEqual(self.client.get("/api/v1/system/health").status_code, 200)

    def stop_app(self):
        if self.client is not None:
            self.client.__exit__(None, None, None)
            self.client = None

    def request(self, method, path, body=None):
        response = self.client.request(
            method, path, json=body, headers={"Idempotency-Key": str(uuid4())}
        )
        self.assertLess(response.status_code, 300, response.text)
        return response.json()

    def session(self):
        return self.request(
            "POST",
            f"/api/v1/workspaces/{self.workspace}/sessions",
            {"title": "Native validation"},
        )["id"]

    def start_plan(self, calls):
        session = self.session()
        self.request(
            "POST",
            f"/api/v1/sessions/{session}/messages",
            {
                "content": self.model.plan(calls),
                "delivery": "followup",
                "model_selection": {
                    "connection_id": self.connection,
                    "model_id": "windows-test",
                },
                "map_context": {
                    "workspace_id": self.workspace,
                    "viewport": {"latitude": 0, "longitude": 0, "zoom": 1},
                },
            },
        )
        return session

    def wait_turn(self, session):
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            turns = self.request("GET", f"/api/v1/sessions/{session}/agent")
            if turns and turns[-1]["state"] in {
                "completed",
                "failed",
                "cancelled",
                "paused",
            }:
                return turns[-1]
            time.sleep(0.025)
        self.fail(f"Run did not complete: {turns}")

    def plan(self, calls):
        turn = self.wait_turn(self.start_plan(calls))
        self.assertEqual(turn["state"], "completed", turn)
        self.assertEqual(len(turn["tool_calls"]), len(calls), turn)
        return turn["tool_calls"]

    def upload(self, name, data):
        response = self.client.post(
            f"/api/v1/workspaces/{self.workspace}/files",
            params={"name": name, "kind": "file"},
            headers={"Content-Type": "application/octet-stream"},
            content=data,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_search_default_directory_and_file_through_agent(self):
        self.upload("中文文件.txt", "needle 中文\r\n".encode())
        (self.files / "子目录").mkdir()
        (self.files / "子目录/内容.txt").write_bytes(b"needle nested\n")
        calls = [
            {
                "name": name,
                "arguments": {
                    "pattern": "*.txt" if name == "glob" else "needle",
                    **({"path": path} if path else {}),
                },
            }
            for name in ("glob", "grep")
            for path in (None, "子目录", "子目录/内容.txt")
        ]
        tools = self.plan(calls)
        self.assertEqual(len(tools), 6, tools)
        for tool in tools:
            self.assertEqual(tool["status"], "completed", tool)
            self.assertGreater(tool["result"]["total"], 0, tool)
            result = tool["result"]
            paths = (
                result["paths"]
                if result["shape"] == "paths"
                else [item["path"] for item in result["files"]]
            )
            self.assertTrue(all("\\" not in path for path in paths), paths)

    def test_restart_keeps_uploaded_bytes_and_duplicate_names(self):
        original = b"\x00\xff\r\n\n\x1a" * 20000
        first = self.upload("中文二进制.bin", original)
        second = self.upload("中文二进制.bin", original)
        self.assertNotEqual(first["name"], second["name"])
        self.stop_app()
        self.start_app()
        self.request("GET", f"/api/v1/workspaces/{self.workspace}")
        for item in (first, second):
            self.assertEqual(
                (self.files / "data" / item["name"]).read_bytes(), original
            )
        text = self.upload("恢复后.txt", "restart needle\n".encode())
        tools = self.plan(
            [{"name": "read", "arguments": {"file_path": text["file_path"]}}]
        )
        self.assertEqual(tools[0]["status"], "completed", tools)

    def test_read_create_edit_and_overwrite_through_agent(self):
        calls = [
            {
                "name": "write",
                "arguments": {
                    "file_path": "新目录/文件.txt",
                    "content": "hello\r\nworld\r\n",
                },
            },
            {"name": "read", "arguments": {"file_path": "新目录/文件.txt"}},
            {
                "name": "edit",
                "arguments": {
                    "file_path": "新目录/文件.txt",
                    "old_string": "world",
                    "new_string": "世界",
                },
            },
            {"name": "read", "arguments": {"file_path": "新目录/文件.txt"}},
            {
                "name": "write",
                "arguments": {"file_path": "新目录/文件.txt", "content": "replaced\n"},
            },
        ]
        tools = self.plan(calls)
        self.assertTrue(all(tool["status"] == "completed" for tool in tools), tools)
        self.assertEqual((self.files / "新目录/文件.txt").read_bytes(), b"replaced\n")

    @unittest.skipUnless(os.name == "nt", "Windows path aliases and junctions")
    def test_search_rejects_windows_aliases_and_junctions(self):
        import _winapi

        outside = self.root / "outside"
        outside.mkdir()
        (outside / "secret.txt").write_bytes(b"secret needle")
        junction = self.files / "jump"
        _winapi.CreateJunction(str(outside), str(junction))
        self.addCleanup(junction.rmdir)
        tools = self.plan(
            [
                {"name": "grep", "arguments": {"pattern": "needle", "path": path}}
                for path in (
                    "NUL",
                    "file.txt:stream",
                    "..\\outside",
                    "jump",
                    "jump/secret.txt",
                )
            ]
        )
        self.assertEqual(len(tools), 5)
        for tool in tools:
            self.assertEqual(tool["status"], "failed", tool)
            self.assertIn(
                tool["error_code"], {"FS_INVALID_PATH", "FS_PERMISSION_DENIED"}, tool
            )
        safe = self.plan([{"name": "grep", "arguments": {"pattern": "secret"}}])
        self.assertEqual(safe[0]["result"]["total"], 0, safe)


if __name__ == "__main__":
    unittest.main()
