"""Process-local publication after the entire event transaction commits."""

import logging
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import event
from sqlalchemy.orm import Session, sessionmaker

from kunyu.agent.runtime.events import AgentEvent
from kunyu.agent.runtime.session_state import ReducedSession

logger = logging.getLogger(__name__)
_PENDING = "kunyu.session_event_publications"


@dataclass(frozen=True, slots=True)
class SessionEventPublication:
    events: tuple[AgentEvent, ...]
    inbox_before: ReducedSession | None
    after: ReducedSession


class SessionEventPublications:
    def __init__(self, sessions: sessionmaker[Session]) -> None:
        self._listeners: list[Callable[[SessionEventPublication], None]] = []
        self._ready: deque[SessionEventPublication] = deque()
        self._publishing = False
        event.listen(sessions, "after_commit", self._committed)
        event.listen(sessions, "after_rollback", self._rolled_back)
        self._sessions = sessions

    def subscribe(
        self, listener: Callable[[SessionEventPublication], None]
    ) -> Callable[[], None]:
        self._listeners.append(listener)

        def unsubscribe() -> None:
            self._listeners.remove(listener)

        return unsubscribe

    def close(self) -> None:
        event.remove(self._sessions, "after_commit", self._committed)
        event.remove(self._sessions, "after_rollback", self._rolled_back)
        self._listeners.clear()

    def _committed(self, session: Session) -> None:
        pending = session.info.get(_PENDING, {})
        nested = session.get_nested_transaction()
        if nested is not None:
            pending.setdefault(nested.parent, []).extend(pending.pop(nested, ()))
            return
        self._ready.extend(pending.pop(session.get_transaction(), ()))
        session.info.pop(_PENDING, None)
        if self._publishing:
            return
        self._publishing = True
        try:
            while self._ready:
                publication = self._ready.popleft()
                for listener in tuple(self._listeners):
                    try:
                        listener(publication)
                    except BaseException:
                        logger.exception("Committed session event observer failed.")
        finally:
            self._publishing = False

    @staticmethod
    def _rolled_back(session: Session) -> None:
        nested = session.get_nested_transaction()
        if nested is None:
            session.info.pop(_PENDING, None)
        else:
            session.info.get(_PENDING, {}).pop(nested, None)


def stage_publication(session: Session, publication: SessionEventPublication) -> None:
    transaction = session.get_nested_transaction() or session.get_transaction()
    if transaction is None:
        raise RuntimeError("Session event publication requires a transaction.")
    session.info.setdefault(_PENDING, {}).setdefault(transaction, []).append(
        publication
    )
