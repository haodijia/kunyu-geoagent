"""Scoped filesystem contracts; tools do not own native path or storage access."""

from collections.abc import AsyncGenerator, Generator
from dataclasses import dataclass
from threading import Event
from typing import Literal, Protocol

from kunyu.domain.attachments import Attachment


class FilesystemError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


@dataclass(frozen=True, slots=True)
class FilesystemScope:
    workspace_id: str
    session_id: str
    attachments: tuple[Attachment, ...]


@dataclass(frozen=True, slots=True)
class FsTarget:
    display_path: str
    scope: FilesystemScope
    kind: Literal["workspace", "attachment"]
    parts: tuple[str, ...]
    attachment: Attachment | None

    @property
    def key(self) -> tuple[str, str]:
        return self.scope.workspace_id, self.display_path


@dataclass(frozen=True, slots=True)
class FsInfo:
    version: str
    kind: Literal["file", "directory", "other"]
    size: int | None


@dataclass(frozen=True, slots=True)
class FsDirectoryEntry:
    name: str
    type: Literal["file", "directory", "other"]
    size: int | None


@dataclass(frozen=True, slots=True)
class FsDirectoryListing:
    path: str
    entries: tuple[FsDirectoryEntry, ...]
    truncated: bool


@dataclass(frozen=True, slots=True)
class FsWatchFrame:
    path: str
    kind: Literal["ready", "change"]
    info: FsInfo | None


@dataclass(frozen=True, slots=True)
class FsObservation:
    kind: Literal["present", "absent"]
    version: str | None = None

    def __post_init__(self) -> None:
        if (
            self.kind not in {"present", "absent"}
            or (self.kind == "present") != (self.version is not None)
            or (
                self.version is not None
                and (not isinstance(self.version, str) or not self.version)
            )
        ):
            raise ValueError(
                "A present observation requires a version; absence has none."
            )


@dataclass(frozen=True, slots=True)
class FsWriteIntent:
    kind: Literal["create_if_absent", "replace_if_version"]
    version: str | None = None

    def __post_init__(self) -> None:
        if (
            self.kind not in {"create_if_absent", "replace_if_version"}
            or (self.kind == "replace_if_version") != (self.version is not None)
            or (
                self.version is not None
                and (not isinstance(self.version, str) or not self.version)
            )
        ):
            raise ValueError("A replacement requires a version; creation has none.")


@dataclass(frozen=True, slots=True)
class FsEditRequest:
    old_string: str
    new_string: str
    replace_all: bool


@dataclass(frozen=True, slots=True)
class FsMutationOutcome:
    operation: Literal["create", "update"]
    version: str
    before: str | None
    after: str


class Filesystem(Protocol):
    def resolve(self, file_path: str, scope: FilesystemScope) -> FsTarget: ...

    def stat(self, target: FsTarget, cancelled: Event) -> FsInfo | None: ...

    def list_directory(
        self, target: FsTarget, cancelled: Event
    ) -> FsDirectoryListing: ...

    def read_text(self, target: FsTarget, cancelled: Event) -> str: ...

    def watch(self, target: FsTarget) -> AsyncGenerator[FsWatchFrame, None]: ...

    def stream_text(self, target: FsTarget, cancelled: Event) -> Generator[str]: ...

    def stream_bytes(self, target: FsTarget, cancelled: Event) -> Generator[bytes]: ...

    def write_text(
        self,
        target: FsTarget,
        content: str,
        intent: FsWriteIntent | None,
        cancelled: Event,
    ) -> FsMutationOutcome: ...

    def edit_text(
        self,
        target: FsTarget,
        edit: FsEditRequest,
        version: str | None,
        cancelled: Event,
    ) -> FsMutationOutcome: ...
