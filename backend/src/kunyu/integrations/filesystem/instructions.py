"""Explicit editor access to the single workspace-root instruction file."""

import stat
from pathlib import Path
from threading import Event

from kunyu.domain.workspaces.filesystem import FilesystemError, FsTarget
from kunyu.integrations.filesystem.io import (
    atomic_write,
    io_error,
    open_parent,
    probe_at,
    version_of,
)


def write_instructions(
    root: Path, target: FsTarget, content: str, version: str | None
) -> str:
    if target.parts != ("AGENTS.md",) or target.read_root is not None:
        raise FilesystemError(
            "FS_INVALID_PATH",
            "The instructions editor only writes /workspace/AGENTS.md.",
        )
    try:
        with open_parent(root, target, create=False) as parent:
            existing = probe_at(parent, "AGENTS.md")
            if existing is not None and not stat.S_ISREG(existing.st_mode):
                raise FilesystemError(
                    "FS_NOT_REGULAR_FILE", "AGENTS.md must be a regular file."
                )
            if (existing is None and version is not None) or (
                existing is not None and version_of(existing) != version
            ):
                raise FilesystemError(
                    "FS_STALE_VERSION",
                    "Instructions changed. Reload them before saving.",
                )
            return atomic_write(
                parent,
                "AGENTS.md",
                content.encode("utf-8"),
                existing,
                target,
                version is None,
                Event(),
            )
    except OSError as error:
        raise io_error(error, target.display_path, "write") from error
