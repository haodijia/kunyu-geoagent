from collections.abc import Iterator
from contextlib import contextmanager
from threading import RLock


class ConnectionOperationLocks:
    def __init__(self) -> None:
        self._registry_lock = RLock()
        self._default_selection_lock = RLock()
        self._locks: dict[str, RLock] = {}

    @contextmanager
    def hold(self, connection_id: str) -> Iterator[None]:
        with self._registry_lock:
            lock = self._locks.setdefault(connection_id, RLock())
        with lock:
            yield

    @contextmanager
    def hold_many(self, connection_ids: set[str]) -> Iterator[None]:
        ordered_ids = sorted(connection_ids)
        with self._registry_lock:
            locks = [self._locks.setdefault(item, RLock()) for item in ordered_ids]
        for lock in locks:
            lock.acquire()
        try:
            yield
        finally:
            for lock in reversed(locks):
                lock.release()

    @contextmanager
    def hold_default_selection(self) -> Iterator[None]:
        with self._default_selection_lock:
            yield
