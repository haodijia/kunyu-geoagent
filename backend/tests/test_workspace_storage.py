"""Workspace creation and original-byte storage on the native host platform."""

import os
import tempfile
import unittest
from pathlib import Path
from threading import Event
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from kunyu.api.errors import install_error_handlers
from kunyu.api.workspaces.files import router as files_router
from kunyu.api.workspaces.routes import router as workspaces_router
from kunyu.domain.workspaces.filesystem import (
    FilesystemError,
    FilesystemScope,
    FsEditRequest,
    FsWriteIntent,
)
from kunyu.integrations.filesystem.io import open_parent
from kunyu.integrations.filesystem.local import MountedFilesystem
from kunyu.integrations.filesystem.workspaces import ManagedWorkspaceFiles
from kunyu.persistence.database import Database


class WorkspaceStorageTests(unittest.TestCase):
    def setUp(self):
        temporary_root = Path(__file__).resolve().parents[2] / ".tmp"
        temporary_root.mkdir(exist_ok=True)
        temporary = tempfile.TemporaryDirectory(
            prefix="kunyu-storage-", dir=temporary_root
        )
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        with patch.dict(os.environ, {"KUNYU_APP_DATA_DIR": str(self.root)}):
            self.database = Database.open()
        self.addCleanup(self.database.close)
        self.app = FastAPI()
        self.app.state.database = self.database
        install_error_handlers(self.app)
        self.app.include_router(workspaces_router)
        self.app.include_router(files_router)
        self.client = self.enterContext(TestClient(self.app))
        # These tests use only the workspace mount, never the attachment store.
        self.filesystem = MountedFilesystem(self.root, None)
        self.cancelled = Event()

    def create_workspace(self):
        response = self.client.post("/api/v1/workspaces", json={"name": "测试工作空间"})
        self.assertEqual(response.status_code, 201, response.text)
        workspace_id = response.json()["id"]
        self.scope = FilesystemScope(workspace_id, None, ())
        self.files = self.root / "workspaces" / workspace_id / "files"
        return workspace_id

    def target(self, path):
        return self.filesystem.resolve(path, self.scope)

    def test_create_workspace_persists_and_prepares_directory(self):
        workspace_id = self.create_workspace()
        self.assertTrue(self.files.is_dir())
        self.assertEqual(
            self.client.get(f"/api/v1/workspaces/{workspace_id}").status_code, 200
        )
        self.assertEqual(len(self.client.get("/api/v1/workspaces").json()), 1)
        # Opening the database again checks committed persistence and startup preparation.
        with patch.dict(os.environ, {"KUNYU_APP_DATA_DIR": str(self.root)}):
            reopened = Database.open()
        try:
            ManagedWorkspaceFiles(reopened.path.parent).prepare(workspace_id)
        finally:
            reopened.close()
        info = self.filesystem.stat(self.target("/workspace"), self.cancelled)
        self.assertEqual(info.kind, "directory")

    def test_upload_preserves_bytes_and_renames_collisions(self):
        workspace_id = self.create_workspace()
        content = b"\x00\xff\r\n\n\x1a" * 20000
        for expected in ("原始数据.bin", "原始数据-2.bin"):
            response = self.client.post(
                f"/api/v1/workspaces/{workspace_id}/files",
                params={"name": "原始数据.bin", "kind": "file"},
                headers={"Content-Type": "application/octet-stream"},
                content=content,
            )
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(response.json()["name"], expected)
            target = self.target(response.json()["file_path"])
            self.assertEqual(
                b"".join(self.filesystem.stream_bytes(target, self.cancelled)), content
            )
        self.assertEqual(list(self.files.rglob("*.tmpdir")), [])

    def test_text_write_edit_and_version_conflicts(self):
        self.create_workspace()
        target = self.target("nested/hello.txt")
        created = self.filesystem.write_text(
            target,
            "你好\r\nworld\r\n",
            FsWriteIntent("create_if_absent"),
            self.cancelled,
        )
        self.assertEqual(
            self.filesystem.read_text(target, self.cancelled), "你好\r\nworld\r\n"
        )
        with self.assertRaises(FilesystemError) as collision:
            self.filesystem.write_text(
                target, "collision", FsWriteIntent("create_if_absent"), self.cancelled
            )
        self.assertEqual(collision.exception.code, "FS_NOT_OBSERVED")
        edited = self.filesystem.edit_text(
            target,
            FsEditRequest("world", "世界", False),
            created.version,
            self.cancelled,
        )
        self.assertEqual(
            (self.files / "nested/hello.txt").read_bytes(), "你好\r\n世界\r\n".encode()
        )
        with self.assertRaises(FilesystemError) as stale:
            self.filesystem.write_text(
                target,
                "stale",
                FsWriteIntent("replace_if_version", created.version),
                self.cancelled,
            )
        self.assertEqual(stale.exception.code, "FS_STALE_VERSION")
        self.filesystem.write_text(
            target,
            "updated",
            FsWriteIntent("replace_if_version", edited.version),
            self.cancelled,
        )
        self.assertEqual(self.filesystem.read_text(target, self.cancelled), "updated")

    def test_directory_failure_rolls_back_database(self):
        with patch.object(
            ManagedWorkspaceFiles,
            "prepare",
            side_effect=FilesystemError("FS_IO_ERROR", "test failure"),
        ):
            with self.assertLogs("kunyu.api.workspaces.routes", level="ERROR"):
                response = self.client.post(
                    "/api/v1/workspaces", json={"name": "failed"}
                )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.client.get("/api/v1/workspaces").json(), [])

    def test_cancelled_directory_operation_does_not_create_children(self):
        self.create_workspace()
        self.cancelled.set()
        with self.assertRaises(FilesystemError) as aborted:
            with open_parent(
                self.root,
                self.target("cancelled/file.txt"),
                create=True,
                cancelled=self.cancelled,
            ):
                self.fail("Cancelled directory operation succeeded")
        self.assertEqual(aborted.exception.code, "FS_ABORTED")
        self.assertFalse((self.files / "cancelled").exists())

    @unittest.skipUnless(os.name == "nt", "Windows path and directory-handle behavior")
    def test_windows_path_aliases_are_rejected(self):
        workspace_id = self.create_workspace()
        for path in (
            "..\\escape.txt",
            "C:escape.txt",
            "NUL",
            "COM1.txt",
            "file.txt:stream",
            "alias.",
            "alias ",
        ):
            with self.subTest(path=path), self.assertRaises(FilesystemError):
                self.filesystem.write_text(
                    self.target(path), "escape", None, self.cancelled
                )
        response = self.client.post(
            f"/api/v1/workspaces/{workspace_id}/files",
            params={"name": "file:stream", "kind": "file"},
            headers={"Content-Type": "application/octet-stream"},
            content=b"invalid",
        )
        self.assertEqual(response.status_code, 422, response.text)

    @unittest.skipUnless(os.name == "nt", "Windows directory pins")
    def test_windows_directories_remain_pinned_until_context_exit(self):
        self.create_workspace()
        renamed = self.files.with_name("renamed")
        with open_parent(self.root, self.target("test.txt")):
            with self.assertRaises(PermissionError):
                self.files.rename(renamed)
        self.files.rename(renamed)
        renamed.rename(self.files)

    @unittest.skipUnless(os.name == "nt", "Windows junctions")
    def test_windows_junctions_cannot_redirect_workspace_io(self):
        import _winapi

        workspace_id = self.create_workspace()
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "secret.txt").write_bytes(b"outside")
        junction = self.files / "data"
        _winapi.CreateJunction(str(outside), str(junction))
        self.addCleanup(junction.rmdir)
        for operation in (
            lambda: self.filesystem.read_text(
                self.target("data/secret.txt"), self.cancelled
            ),
            lambda: self.filesystem.write_text(
                self.target("data/secret.txt"), "changed", None, self.cancelled
            ),
            lambda: ManagedWorkspaceFiles(self.root).save(
                workspace_id, "new.txt", "file", b"new", self.cancelled
            ),
        ):
            with self.assertRaises(FilesystemError) as rejected:
                operation()
            self.assertEqual(rejected.exception.code, "FS_PERMISSION_DENIED")
        self.assertEqual((outside / "secret.txt").read_bytes(), b"outside")
        self.assertFalse((outside / "new.txt").exists())

    @unittest.skipUnless(os.name == "nt", "Windows staged writes")
    def test_windows_cancellation_discards_staged_file(self):
        self.create_workspace()
        target = self.target("original.txt")
        self.filesystem.write_text(target, "original", None, self.cancelled)
        write = os.write

        def cancel_after_chunk(descriptor, data):
            written = write(descriptor, data)
            self.cancelled.set()
            return written

        with patch(
            "kunyu.integrations.filesystem.windows.os.write",
            side_effect=cancel_after_chunk,
        ):
            with self.assertRaises(FilesystemError) as aborted:
                self.filesystem.write_text(target, "new" * 100000, None, self.cancelled)
        self.assertEqual(aborted.exception.code, "FS_ABORTED")
        self.assertEqual((self.files / "original.txt").read_bytes(), b"original")
        self.assertEqual(list(self.files.rglob("*.tmpdir")), [])


if __name__ == "__main__":
    unittest.main()
