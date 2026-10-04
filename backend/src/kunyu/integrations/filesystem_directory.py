"""Bounded, stable workspace directory listings without following native links."""

import os
import re
import stat
from collections.abc import Generator
from heapq import nsmallest
from pathlib import Path
from threading import Event

from kunyu.domain.filesystem import (
    FilesystemError,
    FsDirectoryEntry,
    FsDirectoryListing,
    FsTarget,
)
from kunyu.integrations.filesystem_io import (
    check_cancelled,
    io_error,
    open_directory,
    probe_at,
)
from kunyu.integrations.search_storage import SEARCH_DIRECTORY

DIRECTORY_ENTRY_LIMIT = 2000


def list_workspace_directory(
    root: Path, target: FsTarget, cancelled: Event
) -> FsDirectoryListing:
    check_cancelled(cancelled, "list")
    if target.kind != "workspace":
        raise FilesystemError(
            "FS_NOT_DIRECTORY", "Only workspace directories can be listed."
        )
    try:
        with open_directory(root, target, cancelled) as directory:

            def names() -> Generator[str]:
                with os.scandir(directory) as iterator:
                    for entry in iterator:
                        check_cancelled(cancelled, "list")
                        if (
                            not target.parts
                            and entry.name.casefold() == SEARCH_DIRECTORY
                        ) or re.fullmatch(
                            r"\.[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.tmpdir",
                            entry.name,
                        ):
                            continue
                        try:
                            entry.name.encode("utf-8")
                        except UnicodeEncodeError as error:
                            raise FilesystemError(
                                "FS_INVALID_PATH",
                                "A directory entry is not valid UTF-8.",
                            ) from error
                        yield entry.name

            selected = nsmallest(DIRECTORY_ENTRY_LIMIT + 1, names())
            entries = []
            for name in selected[:DIRECTORY_ENTRY_LIMIT]:
                check_cancelled(cancelled, "list")
                info = probe_at(directory, name)
                if info is None:
                    raise FilesystemError(
                        "FS_STALE_VERSION",
                        "The directory changed while listing; refresh it.",
                    )
                kind = (
                    "file"
                    if stat.S_ISREG(info.st_mode)
                    else "directory"
                    if stat.S_ISDIR(info.st_mode)
                    else "other"
                )
                entries.append(
                    FsDirectoryEntry(
                        name, kind, info.st_size if kind == "file" else None
                    )
                )
            return FsDirectoryListing(
                target.display_path,
                tuple(entries),
                len(selected) > DIRECTORY_ENTRY_LIMIT,
            )
    except OSError as error:
        raise io_error(error, target.display_path, "list") from error
