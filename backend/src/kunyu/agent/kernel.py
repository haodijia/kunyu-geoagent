"""Dependency-ordered plugin composition with owned service publication."""

from builtins import BaseExceptionGroup
from typing import Protocol

from kunyu.agent.scope import Context, ServiceKey


class Plugin(Protocol):
    name: str
    provides: tuple[ServiceKey, ...]
    requires: tuple[ServiceKey, ...]

    async def apply(self, context: Context) -> None: ...


async def install_plugin(
    parent: Context, plugin: Plugin, *, lifetime: Context | None = None
) -> Context:
    for key in plugin.requires:
        parent.require(key)
    for key in plugin.provides:
        if key in parent._services:
            raise ValueError(f"Service '{key.name}' already has a provider.")
    context = parent.child(scoped=False)
    try:
        # Provider unload drains dependents, including inherited scoped consumers.
        owner = context if lifetime is None else lifetime
        providers = tuple(
            dict.fromkeys(parent.provider_of(key) for key in plugin.requires)
        )
        for provider in providers:
            if provider is not None:
                context.effect(provider.effect(owner.close, before_children=True))
        await plugin.apply(context)
        parent.assert_active()
        if set(context._services) != set(plugin.provides):
            raise ValueError(
                f"Plugin '{plugin.name}' did not provide its declared services."
            )
        for key in plugin.provides:
            parent.provide(key, context._services[key])
            parent._providers[key] = context

        def unpublish() -> None:
            for key in plugin.provides:
                del parent._services[key]
                del parent._providers[key]

        context.effect(unpublish)
        return context
    except BaseException as error:
        try:
            await context.close()
        except BaseException as cleanup_error:  # noqa: BLE001 -- report both setup and cleanup failures
            raise BaseExceptionGroup(
                f"Plugin '{plugin.name}' setup and rollback failed.",
                [error, cleanup_error],
            ) from None
        raise


class Kernel:
    def __init__(self) -> None:
        self.context = Context()
        self._plugins: list[Plugin] = []
        self._started = False

    def register(self, plugin: Plugin) -> None:
        if self._started:
            raise RuntimeError("Register plugins before starting the kernel.")
        if any(item.name == plugin.name for item in self._plugins):
            raise ValueError(f"Plugin '{plugin.name}' is already registered.")
        self._plugins.append(plugin)

    async def start(self) -> None:
        if self._started:
            raise RuntimeError("Agent kernel has already started.")
        self._started = True
        try:
            pending = list(self._plugins)
            available = set(self.context._services)
            providers = set(available)
            for plugin in pending:
                for key in plugin.provides:
                    if key in providers:
                        raise ValueError(
                            f"Service '{key.name}' has duplicate providers."
                        )
                    providers.add(key)
            ordered: list[Plugin] = []
            while pending:
                ready = next(
                    (plugin for plugin in pending if set(plugin.requires) <= available),
                    None,
                )
                if ready is None:
                    raise ValueError(
                        "Missing or cyclic plugin dependencies: "
                        + ", ".join(plugin.name for plugin in pending)
                    )
                ordered.append(ready)
                pending.remove(ready)
                available.update(ready.provides)
            for plugin in ordered:
                await install_plugin(self.context, plugin)
        except BaseException as error:
            try:
                await self.stop()
            except BaseException as cleanup_error:  # noqa: BLE001 -- preserve rollback errors
                raise BaseExceptionGroup(
                    "Agent kernel startup and rollback failed.", [error, cleanup_error]
                ) from None
            raise

    async def stop(self) -> None:
        await self.context.close()
