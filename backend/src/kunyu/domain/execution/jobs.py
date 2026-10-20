"""Persistent job facts shared by producers, readers and UI events."""

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

type JobStatus = Literal["running", "stopping", "completed", "failed", "killed"]
type JobStage = Literal[
    "prepare",
    "authenticate",
    "compile",
    "submit",
    "execute",
    "collect",
    "render",
    "completed",
]
TERMINAL_JOB_STATES = frozenset({"completed", "failed", "killed"})


class JobError(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: str
    message: str
    truncated: bool

    @classmethod
    def from_message(cls, code: str, message: str) -> "JobError":
        low, high = 0, len(message)
        while low < high:
            middle = (low + high + 1) // 2
            if len(json.dumps(message[:middle], ensure_ascii=False).encode()) <= 4000:
                low = middle
            else:
                high = middle - 1
        return cls(code=code, message=message[:low], truncated=low < len(message))


class JobSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")
    owner_run_id: str
    tool_call_id: str
    kind: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=200)
    status: JobStatus
    stage: JobStage
    detail: str | None
    error: JobError | None
    log_file_path: str
    started_at: float
    finished_at: float | None


class JobFailure(RuntimeError):
    def __init__(self, code: str, message: str, stage: JobStage) -> None:
        self.code, self.stage = code, stage
        super().__init__(message)


class JobNotFoundError(LookupError):
    pass
