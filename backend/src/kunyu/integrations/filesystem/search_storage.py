"""Workspace search roots and immutable, session-owned recovery artifacts."""

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

SEARCH_DIRECTORY = ".cache"


def search_artifact_parts(parts: tuple[str, ...], scope: FilesystemScope) -> bool:
    return (
        len(parts) == 5
        and parts[0] == SEARCH_DIRECTORY
        and parts[1] == "search"
        and parts[2] == scope.session_id
        and re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", parts[3])
        is not None
        and parts[4] in {"glob-results.txt", "grep-results.txt"}
    )


class WorkspaceSearchStorage:
    def __init__(self, data_directory: Path) -> None:
        self._root = data_directory.resolve()

    @contextmanager
    def root(self, target: FsTarget):
        if target.parts and target.parts[0].casefold() == SEARCH_DIRECTORY:
            raise FilesystemError(
                "FS_PERMISSION_DENIED", "Search artifacts are excluded from discovery."
            )
        scope = target.scope
        dummy = FsTarget("/workspace/.search-root", scope, (".search-root",))
        # The managed directory is infrastructure, provisioned even for an empty workspace.
        with ExitStack() as handles:
            descriptor = handles.enter_context(
                open_parent(self._root, dummy, create=True)
            )
            relative = "/".join(target.parts) if target.parts else "."
            if relative != ".":
                parts = target.parts
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
                self._root / "workspaces" / scope.workspace_id,
                relative,
                descriptor,
            )

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
            "search",
            scope.session_id,
            str(uuid4()),
            f"{name}-results.txt",
        )
        path = "/workspace/" + "/".join(parts)
        target = FsTarget(path, scope, parts)
        with open_parent(
            self._root, target, create=True, cancelled=cancelled
        ) as parent:
            atomic_write(
                parent, parts[-1], text.encode("utf-8"), None, target, True, cancelled
            )
        return path
