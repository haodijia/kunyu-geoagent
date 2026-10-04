"""Scoped filesystem contracts; tools do not own native path or storage access."""

from collections.abc import Generator
from dataclasses import dataclass
from threading import Event
from typing import Literal, Protocol

from kunyu.domain.attachments import FileAttachment


class FilesystemError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


@dataclass(frozen=True, slots=True)
class FilesystemScope:
    workspace_id: str
    session_id: str
    attachments: tuple[FileAttachment, ...]


@dataclass(frozen=True, slots=True)
class ReadTarget:
    display_path: str
    scope: FilesystemScope
    kind: Literal["workspace", "attachment"]
    parts: tuple[str, ...]
    attachment: FileAttachment | None


class Filesystem(Protocol):
    def resolve(self, file_path: str, scope: FilesystemScope) -> ReadTarget: ...

    def stream_text(self, target: ReadTarget, cancelled: Event) -> Generator[str]: ...
