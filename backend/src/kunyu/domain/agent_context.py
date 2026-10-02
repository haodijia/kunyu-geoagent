from dataclasses import dataclass
from typing import Protocol

from pydantic import JsonValue

from kunyu.agent.runtime.run_state import ReducedRun
from kunyu.agent.runtime.session_state import ReducedSession
from kunyu.domain.commands import SessionControls
from kunyu.domain.sessions import Session
from kunyu.domain.workspaces import Workspace


@dataclass(frozen=True, slots=True)
class InjectedContext:
    sequence: int
    content: str
    producer: str
    metadata: dict[str, JsonValue]


@dataclass(frozen=True, slots=True)
class RunContextSource:
    workspace: Workspace
    session: Session
    run: ReducedRun
    reduced_session: ReducedSession
    injected_context: tuple[InjectedContext, ...]
    controls: SessionControls


class RunContextRepository(Protocol):
    def get(self, run_id: str) -> RunContextSource | None: ...
