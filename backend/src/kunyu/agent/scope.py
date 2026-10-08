"""Inherited services, registration scopes and owned asynchronous teardown."""

import asyncio
import inspect
from builtins import BaseExceptionGroup
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import cast


@dataclass(frozen=True, slots=True)
class ServiceKey[T]:
    name: str


@dataclass(eq=False, frozen=True, slots=True)
class ScopeKey:
    parent: "ScopeKey | None" = None


type Disposer = Callable[[], Awaitable[None] | None]


class Context:
    def __init__(self, parent: "Context | None" = None, *, scoped: bool = True):
        self.parent = parent
        self.scope = (
            ScopeKey(parent.scope if parent else None)
            if scoped or parent is None
            else parent.scope
        )
        self._services: dict[ServiceKey, object] = {}
        self._providers: dict[ServiceKey, Context] = {}
        self._effects: list[Disposer] = []
        self._quiesce: list[Disposer] = []
        self._closing: asyncio.Task[None] | None = None
        self._detach = parent.effect(self.close) if parent else None

    def assert_active(self) -> None:
        if self._closing is not None:
            raise RuntimeError("Agent context is disposing or disposed.")
        if self.parent is not None:
            self.parent.assert_active()

    @property
    def active(self) -> bool:
        return self._closing is None and (self.parent is None or self.parent.active)

    @property
    def disposing(self) -> bool:
        return self._closing is not None

    def provider_of(self, key: ServiceKey) -> "Context | None":
        cursor: Context | None = self
        while cursor is not None:
            if key in cursor._services:
                return cursor._providers.get(key)
            cursor = cursor.parent
        raise LookupError(f"Agent service '{key.name}' is not installed.")

    def child(self, *, scoped: bool = True) -> "Context":
        self.assert_active()
        return Context(self, scoped=scoped)

    def require[T](self, key: ServiceKey[T]) -> T:
        self.assert_active()
        cursor: Context | None = self
        while cursor is not None:
            if key in cursor._services:
                return cast(T, cursor._services[key])
            cursor = cursor.parent
        raise LookupError(f"Agent service '{key.name}' is not installed.")

    def provide[T](self, key: ServiceKey[T], value: T) -> None:
        self.assert_active()
        if key in self._services:
            raise ValueError(f"Agent service '{key.name}' is already provided.")
        self._services[key] = value

    def effect(
        self, dispose: Disposer, *, before_children: bool = False
    ) -> Callable[[], None]:
        self.assert_active()
        effects = self._quiesce if before_children else self._effects
        effects.append(dispose)

        def detach() -> None:
            if dispose in effects:
                effects.remove(dispose)

        return detach

    async def close(self) -> None:
        if self._closing is None:
            self._closing = asyncio.create_task(self._dispose())
        await asyncio.shield(self._closing)

    async def _dispose(self) -> None:
        failures: list[BaseException] = []
        try:
            for dispose in (
                *reversed(tuple(self._quiesce)),
                *reversed(tuple(self._effects)),
            ):
                try:
                    result = dispose()
                    if inspect.isawaitable(result):
                        await result
                except BaseException as error:  # noqa: BLE001 -- unwind every owned resource
                    failures.append(error)
        finally:
            self._effects.clear()
            self._quiesce.clear()
            self._services.clear()
            self._providers.clear()
            if self._detach is not None:
                self._detach()
        if failures:
            raise BaseExceptionGroup("Agent scope disposal failed.", failures)


class ScopedEntries[T]:
    """Nearest scoped name wins; ownership and visibility are separate."""

    def __init__(self) -> None:
        self._layers: dict[ScopeKey, dict[str, T]] = {}

    def register(self, owner: Context, name: str, value: T) -> Callable[[], None]:
        owner.assert_active()
        if not name:
            raise ValueError("Registration names must not be empty.")
        layer = self._layers.setdefault(owner.scope, {})
        if name in layer:
            raise ValueError(f"'{name}' is already registered in this scope.")
        layer[name] = value
        active = True

        def remove() -> None:
            nonlocal active
            if not active:
                return
            active = False
            del layer[name]
            if not layer:
                del self._layers[owner.scope]
            detach()

        detach = owner.effect(remove)
        return remove

    def view(self, context: Context) -> dict[str, T]:
        context.assert_active()
        return self.view_scope(context.scope)

    def view_scope(self, scope: ScopeKey) -> dict[str, T]:
        """Resolve a notification carrier while its lifecycle is unwinding."""
        values: dict[str, T] = {}
        for layer in self._layers_for_scope(scope):
            values.update(layer)
        return values

    def layers(self, context: Context) -> tuple[dict[str, T], ...]:
        """Global-to-nearest registration layers without collapsing ownership."""
        context.assert_active()
        return self._layers_for_scope(context.scope)

    def _layers_for_scope(self, scope: ScopeKey) -> tuple[dict[str, T], ...]:
        chain: list[ScopeKey] = []
        cursor: ScopeKey | None = scope
        while cursor is not None:
            chain.append(cursor)
            cursor = cursor.parent
        return tuple(
            dict(self._layers[key]) for key in reversed(chain) if key in self._layers
        )


class AgentScopes:
    """One live registration scope per durable session identity."""

    def __init__(self, owner: Context) -> None:
        self._owner = owner
        self._sessions: dict[str, Context] = {}

    def for_session(self, session_id: str) -> Context:
        self._owner.assert_active()
        if session_id not in self._sessions:
            context = self._owner.child()
            context.effect(lambda: self._sessions.pop(session_id))
            self._sessions[session_id] = context
        return self._sessions[session_id]
