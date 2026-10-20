"""Provision private workspace roots and publish original bytes without overwrites."""

import mimetypes
import os
import stat
from pathlib import Path, PurePosixPath
from threading import Event
from typing import Literal

from kunyu.domain.workspaces.filesystem import (
    FilesystemError,
    FilesystemScope,
    FsTarget,
)
from kunyu.domain.workspaces.workspace_files import WorkspaceFile
from kunyu.integrations.filesystem.io import (
    atomic_write,
    check_cancelled,
    io_error,
    open_directory,
    open_parent,
    probe_at,
)


def validate_filename(name: str) -> None:
    if (
        not name.strip()
        or name in {".", ".."}
        or any(char in "/\\" or ord(char) < 32 or ord(char) == 127 for char in name)
    ):
        raise FilesystemError(
            "FS_INVALID_PATH",
            "Choose a filename without path separators or control characters.",
        )
    try:
        size = len(name.encode("utf-8"))
    except UnicodeEncodeError as error:
        raise FilesystemError(
            "FS_INVALID_PATH", "Filename must be valid Unicode."
        ) from error
    if size > 255:
        raise FilesystemError("FS_INVALID_PATH", "Filename exceeds the 255-byte limit.")


class ManagedWorkspaceFiles:
    def __init__(self, data_directory: Path) -> None:
        self.root = data_directory

    def prepare(self, workspace_id: str) -> None:
        scope = FilesystemScope(workspace_id, None)
        target = FsTarget("/workspace", scope, "workspace", (), None)
        try:
            with open_directory(self.root, target, Event()):
                pass
        except OSError as error:
            raise io_error(error, "/workspace", "create") from error

    def search(
        self, workspace_id: str, query: str, limit: int, cancelled: Event
    ) -> list[WorkspaceFile]:
        scope = FilesystemScope(workspace_id, None)
        pending = [()]
        result = []
        while pending:
            parts = pending.pop()
            path = "/workspace" + ("/" + "/".join(parts) if parts else "")
            target = FsTarget(path, scope, "workspace", parts, None)
            try:
                with (
                    open_directory(self.root, target, cancelled) as directory,
                    os.scandir(directory) as entries,
                ):
                    for entry in sorted(entries, key=lambda item: item.name):
                        check_cancelled(cancelled, "list")
                        if entry.name.startswith(".kunyu-"):
                            continue
                        info = entry.stat(follow_symlinks=False)
                        child = (*parts, entry.name)
                        if stat.S_ISDIR(info.st_mode):
                            pending.append(child)
                        elif stat.S_ISREG(info.st_mode):
                            virtual_path = "/workspace/" + "/".join(child)
                            if query.casefold() not in virtual_path.casefold():
                                continue
                            media_type, _ = mimetypes.guess_type(entry.name)
                            result.append(
                                WorkspaceFile(
                                    entry.name,
                                    virtual_path,
                                    info.st_size,
                                    "image"
                                    if media_type is not None
                                    and media_type.startswith("image/")
                                    else "file",
                                )
                            )
                            if len(result) == limit:
                                return result
            except OSError as error:
                raise io_error(error, path, "list") from error
        return result

    def save(
        self,
        workspace_id: str,
        name: str,
        kind: Literal["file", "image"],
        data: bytes,
        cancelled: Event,
    ) -> WorkspaceFile:
        validate_filename(name)
        folder = "images" if kind == "image" else "data"
        scope = FilesystemScope(workspace_id, None)
        target = FsTarget(
            f"/workspace/{folder}/{name}", scope, "workspace", (folder, name), None
        )
        original = PurePosixPath(name)
        try:
            with open_parent(
                self.root, target, create=True, cancelled=cancelled
            ) as parent:
                index = 1
                while True:
                    check_cancelled(cancelled, "upload")
                    candidate = (
                        name
                        if index == 1
                        else f"{original.stem}-{index}{original.suffix}"
                    )
                    validate_filename(candidate)
                    if probe_at(parent, candidate) is not None:
                        index += 1
                        continue
                    chosen = FsTarget(
                        f"/workspace/{folder}/{candidate}",
                        scope,
                        "workspace",
                        (folder, candidate),
                        None,
                    )
                    try:
                        atomic_write(
                            parent, candidate, data, None, chosen, True, cancelled
                        )
                    except FilesystemError as error:
                        if error.code not in {"FS_NOT_OBSERVED", "FS_NOT_REGULAR_FILE"}:
                            raise
                        index += 1
                        continue
                    return WorkspaceFile(
                        candidate, chosen.display_path, len(data), kind
                    )
        except OSError as error:
            raise io_error(error, target.display_path, "upload") from error
