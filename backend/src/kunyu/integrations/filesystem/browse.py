"""Read-only directory browsing and original-byte delivery on workspace mounts."""

import mimetypes
import os
import stat
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from threading import Event

from kunyu.domain.workspaces.filesystem import FilesystemError, FilesystemScope
from kunyu.domain.workspaces.workspace_files import (
    WorkspaceContent,
    WorkspaceEntry,
    WorkspaceListing,
)
from kunyu.integrations.filesystem.io import (
    CHUNK_BYTES,
    check_cancelled,
    io_error,
    open_directory,
    open_file,
)
from kunyu.integrations.filesystem.local import MountedFilesystem


class WorkspaceBrowser:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.filesystem = MountedFilesystem(root)

    def list(
        self, workspace_id: str, file_path: str, cancelled: Event
    ) -> WorkspaceListing:
        target = self.filesystem.resolve(file_path, FilesystemScope(workspace_id, None))
        entries = []
        try:
            with (
                open_directory(self.root, target, cancelled) as directory,
                os.scandir(directory) as children,
            ):
                for child in children:
                    check_cancelled(cancelled, "list")
                    if child.name.startswith("."):
                        continue
                    info = child.stat(follow_symlinks=False)
                    is_directory = stat.S_ISDIR(info.st_mode)
                    if not is_directory and not stat.S_ISREG(info.st_mode):
                        continue
                    entries.append(
                        WorkspaceEntry(
                            name=child.name,
                            file_path=f"{target.display_path}/{child.name}",
                            kind="directory" if is_directory else "file",
                            bytes=None if is_directory else info.st_size,
                            media_type=None
                            if is_directory
                            else mimetypes.guess_type(child.name)[0],
                            modified_at=datetime.fromtimestamp(
                                info.st_mtime, UTC
                            ).isoformat(),
                        )
                    )
        except OSError as error:
            raise io_error(error, target.display_path, "list") from error
        entries.sort(
            key=lambda entry: (entry.kind != "directory", entry.name.casefold())
        )
        return WorkspaceListing(file_path=target.display_path, entries=entries)

    @contextmanager
    def open(
        self, workspace_id: str, file_path: str, max_bytes: int | None
    ) -> Iterator[WorkspaceContent]:
        target = self.filesystem.resolve(file_path, FilesystemScope(workspace_id, None))
        try:
            with open_file(self.root, target) as descriptor:
                size = os.fstat(descriptor).st_size
                if max_bytes is not None and size > max_bytes:
                    raise FilesystemError(
                        "FS_PREVIEW_TOO_LARGE", "File exceeds the preview size limit."
                    )

                def chunks() -> Iterator[bytes]:
                    remaining = size
                    while remaining:
                        data = os.read(descriptor, min(CHUNK_BYTES, remaining))
                        if not data:
                            raise FilesystemError(
                                "FS_FILE_CHANGED", "File changed during delivery."
                            )
                        remaining -= len(data)
                        yield data

                yield WorkspaceContent(
                    target.parts[-1],
                    size,
                    mimetypes.guess_type(target.parts[-1])[0]
                    or "application/octet-stream",
                    chunks(),
                )
        except OSError as error:
            raise io_error(error, target.display_path, "read") from error
