from dataclasses import dataclass
from typing import Protocol

from dsh.run_state import ReducedRun
from dsh.session_state import ReducedSession

from kunyu.domain.sessions import Session
from kunyu.domain.workspaces import Workspace


@dataclass(frozen=True, slots=True)
class RunContextSource:
    workspace: Workspace
    session: Session
    run: ReducedRun
    reduced_session: ReducedSession
    injected_context: tuple[str, ...]


class RunContextRepository(Protocol):
    def get(self, run_id: str) -> RunContextSource | None: ...
