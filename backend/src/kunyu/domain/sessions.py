from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from kunyu.domain.events import AgentEvent


@dataclass(frozen=True, slots=True)
class Session:
    id: str
    workspace_id: str
    title: str
    created_at: datetime
    updated_at: datetime


class SessionRepository(Protocol):
    def add(self, session: Session, created_event: AgentEvent) -> Session | None: ...

    def get(self, session_id: str) -> Session | None: ...

    def list_for_workspace(self, workspace_id: str) -> list[Session] | None: ...
