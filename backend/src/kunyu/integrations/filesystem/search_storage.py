"""Workspace search roots and immutable, session-owned recovery artifacts."""

import posixpath
import re
import stat
from contextlib import ExitStack, contextmanager
from pathlib import Path
from threading import Event
from uuid import uuid4

from kunyu.domain.workspaces.filesystem import (
    FilesystemError,
    FilesystemScope,
    FsTarget,
)
from kunyu.integrations.filesystem.io import (
    atomic_write,
    open_directory,
    open_file,
    open_parent,
    probe_at,
)

SEARCH_DIRECTORY = ".kunyu-search"


def search_artifact_parts(parts: tuple[str, ...], scope: FilesystemScope) -> bool:
    return (
        len(parts) == 4
        and parts[0] == SEARCH_DIRECTORY
        and parts[1] == scope.session_id
        and re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", parts[2])
        is not None
        and parts[3] in {"glob-results.txt", "grep-results.txt"}
    )


class WorkspaceSearchStorage:
    def __init__(self, data_directory: Path) -> None:
        self._root = data_directory.resolve()

    @contextmanager
    def root(self, scope: FilesystemScope, path: str | None):
        dummy = FsTarget(
            "/workspace/.search-root", scope, "workspace", (".search-root",), None
        )
        # The managed directory is infrastructure, provisioned even for an empty workspace.
        with ExitStack() as handles:
            descriptor = handles.enter_context(
                open_parent(self._root, dummy, create=True)
            )
            relative = self._relative(path)
            if relative != ".":
                parts = tuple(relative.split("/"))
                target = FsTarget(
                    f"/workspace/{relative}", scope, "workspace", parts, None
                )
                parent = handles.enter_context(open_parent(self._root, target))
                info = probe_at(parent, parts[-1])
                if info is None:
                    raise FilesystemError(
                        "FS_NOT_FOUND", "Search target was not found."
                    )
                if stat.S_ISDIR(info.st_mode):
                    handles.enter_context(open_directory(self._root, target, Event()))
                elif stat.S_ISREG(info.st_mode):
                    handles.enter_context(open_file(self._root, target))
                else:
                    raise FilesystemError(
                        "FS_NOT_REGULAR_FILE",
                        "Search targets must be regular files or directories; symbolic links are not followed.",
                    )
            yield (
                self._root / "workspaces" / scope.workspace_id / "files",
                relative,
                descriptor,
            )

    @staticmethod
    def _relative(path: str | None) -> str:
        if path is None:
            return "."
        if "\x00" in path or len(path) > 4096:
            raise FilesystemError("FS_INVALID_PATH", "Invalid search path.")
        normalized = posixpath.normpath(
            path if path.startswith("/") else f"/workspace/{path}"
        )
        if normalized == "/workspace":
            return "."
        if not normalized.startswith("/workspace/"):
            raise FilesystemError(
                "FS_OUT_OF_SCOPE", "Search paths must stay inside /workspace."
            )
        relative = normalized[len("/workspace/") :]
        if relative.split("/")[0].casefold() == SEARCH_DIRECTORY:
            raise FilesystemError(
                "FS_PERMISSION_DENIED",
                "Search recovery artifacts are read-only and are excluded from discovery.",
            )
        return relative

    def save(
        self, scope: FilesystemScope, name: str, text: str, cancelled: Event
    ) -> str:
        if (
            name not in {"glob", "grep"}
            or scope.session_id is None
            or re.fullmatch(r"[A-Za-z0-9_-]{1,64}", scope.session_id) is None
        ):
            raise FilesystemError("FS_INVALID_SCOPE", "Invalid search artifact owner.")
        parts = (
            SEARCH_DIRECTORY,
            scope.session_id,
            str(uuid4()),
            f"{name}-results.txt",
        )
        path = "/workspace/" + "/".join(parts)
        target = FsTarget(path, scope, "workspace", parts, None)
        with open_parent(
            self._root, target, create=True, cancelled=cancelled
        ) as parent:
            atomic_write(
                parent, parts[-1], text.encode("utf-8"), None, target, True, cancelled
            )
        return path
