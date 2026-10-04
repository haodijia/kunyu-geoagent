"""Session control facts shared by commands, prompt assembly and tool policy."""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True, slots=True)
class SessionControls:
    plan_active: bool = False
    plan_pending: bool | None = None
    plan_narrate: bool = True
    plan_at_last_header: bool | None = None
    permission: Literal["read-only", "workspace-write"] = "workspace-write"
    summary: str | None = None
    compacted_through: int = 0
