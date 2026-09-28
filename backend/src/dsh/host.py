"""Fixed capability assembly and plugin lifecycle."""

import asyncio
from collections.abc import Mapping
from enum import StrEnum
from types import MappingProxyType
from typing import Protocol


class HostError(RuntimeError):
    """Invalid capability graph or lifecycle operation."""


class Capability(StrEnum):
    EVENT_STORE = "event_store"
    MODEL_ADAPTER = "model_adapter"
    CONTEXT = "context"
    MEMORY = "memory"
    TOOL_REGISTRY = "tool_registry"
    POLICY_GATE = "policy_gate"
    RUNNER = "runner"


class Plugin(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def provides(self) -> Mapping[Capability, object]: ...

    @property
    def requires(self) -> frozenset[Capability]: ...

    async def start(self, capabilities: Mapping[Capability, object]) -> None: ...

    async def stop(self) -> None: ...


class Host:
    """Start providers after their dependencies and release them in reverse order."""

    def __init__(self) -> None:
        self._plugins: list[Plugin] = []
        self._started: list[Plugin] = []
        self._capabilities: dict[Capability, object] = {}
        self._running = False
        self._lock = asyncio.Lock()

    def register(self, plugin: Plugin) -> None:
        if self._running or self._lock.locked():
            raise HostError("cannot register plugins while the host is running")
        self._plugins.append(plugin)

    def require(self, capability: Capability) -> object:
        try:
            return self._capabilities[capability]
        except KeyError as error:
            raise HostError(f"capability unavailable: {capability}") from error

    def _ordered_plugins(self) -> list[Plugin]:
        providers: dict[Capability, Plugin] = {}
        for plugin in self._plugins:
            if not plugin.name:
                raise HostError("plugin name cannot be empty")
            if not plugin.provides:
                raise HostError(f"plugin {plugin.name} provides no capabilities")
            for capability in plugin.provides:
                if capability in providers:
                    raise HostError(f"duplicate capability provider: {capability}")
                providers[capability] = plugin

        for plugin in self._plugins:
            for capability in plugin.requires:
                if capability not in providers:
                    raise HostError(f"plugin {plugin.name} requires missing capability: {capability}")

        ordered: list[Plugin] = []
        remaining = list(self._plugins)
        ready: set[Capability] = set()
        while remaining:
            next_plugin = next(
                (plugin for plugin in remaining if plugin.requires <= ready),
                None,
            )
            if next_plugin is None:
                raise HostError("cyclic plugin dependencies")
            ordered.append(next_plugin)
            ready.update(next_plugin.provides)
            remaining.remove(next_plugin)
        return ordered

    async def start(self) -> None:
        async with self._lock:
            if self._running:
                raise HostError("host already started")
            ordered = self._ordered_plugins()
            for plugin in ordered:
                try:
                    await plugin.start(MappingProxyType(self._capabilities.copy()))
                except BaseException as error:
                    failures = await self._release([plugin, *reversed(self._started)])
                    self._started.clear()
                    self._capabilities.clear()
                    if failures:
                        raise BaseExceptionGroup("plugin startup and cleanup failed", [error, *failures]) from error
                    raise
                self._started.append(plugin)
                self._capabilities.update(plugin.provides)
            self._running = True

    async def stop(self) -> None:
        async with self._lock:
            plugins = list(reversed(self._started))
            self._started.clear()
            self._capabilities.clear()
            self._running = False
            failures = await self._release(plugins)
            if failures:
                raise BaseExceptionGroup("plugin cleanup failed", failures)

    @staticmethod
    async def _release(plugins: list[Plugin]) -> list[BaseException]:
        failures: list[BaseException] = []
        for plugin in plugins:
            try:
                await plugin.stop()
            except BaseException as error:
                failures.append(error)
        return failures
