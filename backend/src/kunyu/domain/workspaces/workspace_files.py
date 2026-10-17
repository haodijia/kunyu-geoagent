"""Original workspace files shared by every conversation in that workspace."""

from dataclasses import dataclass
from typing import Literal, Protocol

MAX_WORKSPACE_FILE_BYTES = 64 * 1024 * 1024


@dataclass(frozen=True, slots=True)
class WorkspaceFile:
    name: str
    file_path: str
    bytes: int
    kind: Literal["file", "image"]


class WorkspaceDirectory(Protocol):
    def prepare(self, workspace_id: str) -> None: ...
