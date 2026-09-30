"""Scoped plugin kernel for the agent runtime."""

import asyncio
import inspect
from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import Protocol, TypeAlias


class KernelError(RuntimeError):
    """Invalid plugin graph, scope, or lifecycle operation."""


class Capability(StrEnum):
    EVENT_STORE = "event_store"
    MODEL_ADAPTER = "model_adapter"
    CONTEXT = "context"
    MEMORY = "memory"
    TOOL_REGISTRY = "tool_registry"
    POLICY_GATE = "policy_gate"
    RUNNER = "runner"


Disposer: TypeAlias = Callable[[], Awaitable[None] | None]


class Context:
    """A capability scope with local shadowing and reverse-order disposal."""

    def __init__(self, parent: "Context | None" = None) -> None:
        self._parent = parent
        self._values: dict[Capability, object] = {}
        self._disposers: list[Disposer] = []
        self._closed = False

    def child(self) -> "Context":
        self._assert_open()
        return Context(self)

    def provide(
        self,
        capability: Capability,
        value: object,
        disposer: Disposer | None = None,
    ) -> None:
        self._assert_open()
        self._values[capability] = value
        if disposer is not None:
            self._disposers.append(disposer)

    def effect(self, disposer: Disposer) -> None:
        self._assert_open()
        self._disposers.append(disposer)

    def require(self, capability: Capability) -> object:
        self._assert_open()
        if capability in self._values:
            return self._values[capability]
        if self._parent is not None:
            return self._parent.require(capability)
        raise KernelError(f"capability unavailable: {capability.value}")

    def snapshot(self) -> dict[Capability, object]:
        self._assert_open()
        values = self._parent.snapshot() if self._parent is not None else {}
        values.update(self._values)
        return values

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        failures: list[BaseException] = []
        for disposer in reversed(self._disposers):
            try:
                result = disposer()
                if inspect.isawaitable(result):
                    await result
            except BaseException as error:
                failures.append(error)
        self._disposers.clear()
        self._values.clear()
        if failures:
            raise BaseExceptionGroup("context cleanup failed", failures)

    def _assert_open(self) -> None:
        if self._closed:
            raise KernelError("context is closed")


class Plugin(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def provides(self) -> frozenset[Capability]: ...

    @property
    def requires(self) -> frozenset[Capability]: ...

    async def apply(self, context: Context) -> Disposer | None: ...


class Kernel:
    """Apply dependency-ordered plugins into a root context."""

    def __init__(self) -> None:
        self._plugins: list[Plugin] = []
        self._context: Context | None = None
        self._lock = asyncio.Lock()

    def register(self, plugin: Plugin) -> None:
        if self._context is not None or self._lock.locked():
            raise KernelError("cannot register plugins while the kernel is running")
        self._plugins.append(plugin)

    def require(self, capability: Capability) -> object:
        if self._context is None:
            raise KernelError("kernel is not running")
        return self._context.require(capability)

    def create_scope(self) -> Context:
        if self._context is None:
            raise KernelError("kernel is not running")
        return self._context.child()

    async def start(self) -> None:
        async with self._lock:
            if self._context is not None:
                raise KernelError("kernel already started")
            context = Context()
            try:
                for plugin in self._ordered_plugins():
                    disposer = await plugin.apply(context)
                    if disposer is not None:
                        context.effect(disposer)
            except BaseException as error:
                try:
                    await context.close()
                except BaseException as cleanup_error:
                    raise BaseExceptionGroup(
                        "plugin startup and cleanup failed",
                        [error, cleanup_error],
                    ) from error
                raise
            self._context = context

    async def stop(self) -> None:
        async with self._lock:
            context = self._context
            self._context = None
            if context is not None:
                await context.close()

    def _ordered_plugins(self) -> list[Plugin]:
        providers: dict[Capability, Plugin] = {}
        for plugin in self._plugins:
            if not plugin.name:
                raise KernelError("plugin name cannot be empty")
            if not plugin.provides:
                raise KernelError(f"plugin {plugin.name} provides no capabilities")
            for capability in plugin.provides:
                if capability in providers:
                    raise KernelError(f"duplicate capability provider: {capability.value}")
                providers[capability] = plugin

        for plugin in self._plugins:
            for capability in plugin.requires:
                if capability not in providers:
                    raise KernelError(
                        f"plugin {plugin.name} requires missing capability: {capability.value}"
                    )

        ordered: list[Plugin] = []
        remaining = list(self._plugins)
        ready: set[Capability] = set()
        while remaining:
            plugin = next((item for item in remaining if item.requires <= ready), None)
            if plugin is None:
                raise KernelError("cyclic plugin dependencies")
            ordered.append(plugin)
            ready.update(plugin.provides)
            remaining.remove(plugin)
        return ordered
