"""Scope-owned filesystem observation notifications and single intent slots."""

import inspect
import logging
from collections.abc import Callable
from weakref import WeakKeyDictionary

from kunyu.agent.scope import Context, ScopedEntries
from kunyu.domain.filesystem import (
    FilesystemError,
    FsObservation,
    FsTarget,
    FsWriteIntent,
)

logger = logging.getLogger(__name__)


class FilesystemHooks:
    def __init__(self) -> None:
        self.observed: ScopedEntries[
            Callable[[FsTarget, FsObservation, Context], None]
        ] = ScopedEntries()
        self.write_intent: ScopedEntries[
            Callable[[FsTarget, Context], FsWriteIntent]
        ] = ScopedEntries()
        self.edit_intent: ScopedEntries[Callable[[FsTarget, Context], str]] = (
            ScopedEntries()
        )

    def observe(
        self, target: FsTarget, observation: FsObservation, actor: Context
    ) -> None:
        for listener in self.observed.view(actor).values():
            try:
                returned = listener(target, observation, actor)
                if inspect.iscoroutine(returned):
                    returned.close()
                if returned is not None:
                    raise ValueError(
                        "Filesystem observation listeners must be synchronous and return None."
                    )
            except Exception:
                logger.exception(
                    "Filesystem observation listener failed for %s", target.display_path
                )

    def writing(self, target: FsTarget, actor: Context) -> FsWriteIntent | None:
        listener = self.write_intent.view(actor).get("decision")
        return None if listener is None else listener(target, actor)

    def editing(self, target: FsTarget, actor: Context) -> str | None:
        listener = self.edit_intent.view(actor).get("decision")
        return None if listener is None else listener(target, actor)


class ObservedStateGate:
    def __init__(self) -> None:
        self._observed: WeakKeyDictionary[
            Context, dict[tuple[str, str], FsObservation]
        ] = WeakKeyDictionary()

    def clear(self) -> None:
        self._observed.clear()

    def observe(
        self, target: FsTarget, observation: FsObservation, actor: Context
    ) -> None:
        self._observed.setdefault(actor, {})[target.key] = observation

    def write_intent(self, target: FsTarget, actor: Context) -> FsWriteIntent:
        prior = self._observed.get(actor, {}).get(target.key)
        return (
            FsWriteIntent("replace_if_version", prior.version)
            if prior is not None and prior.kind == "present"
            else FsWriteIntent("create_if_absent")
        )

    def edit_intent(self, target: FsTarget, actor: Context) -> str:
        prior = self._observed.get(actor, {}).get(target.key)
        if prior is None:
            raise FilesystemError(
                "FS_NOT_OBSERVED",
                f'edit requires reading "{target.display_path}" first',
            )
        if prior.kind == "absent":
            raise FilesystemError(
                "FS_NOT_FOUND", f'cannot edit "{target.display_path}": not found'
            )
        assert prior.version is not None
        return prior.version
