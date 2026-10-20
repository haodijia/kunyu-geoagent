"""Original workspace files shared by every conversation in that workspace."""

from dataclasses import dataclass
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict

MAX_WORKSPACE_FILE_BYTES = 64 * 1024 * 1024


@dataclass(frozen=True, slots=True)
class WorkspaceFile:
    name: str
    file_path: str
    bytes: int
    kind: Literal["file", "image"]


class WorkspaceDirectory(Protocol):
    def prepare(self, workspace_id: str) -> None: ...


class WorkspaceResource(BaseModel):
    model_config = ConfigDict(frozen=True)
    name: str
    file_path: str
    kind: Literal["file", "image", "result"]
    detail: str
