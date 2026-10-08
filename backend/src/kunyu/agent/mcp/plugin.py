"""Connection providers contribute scoped tools and literal server instructions."""

import asyncio
from builtins import BaseExceptionGroup
from functools import partial

from kunyu.agent import services as s
from kunyu.agent.mcp.resources import register_resources
from kunyu.agent.mcp.tools import McpTool
from kunyu.agent.runtime.context import PromptSection
from kunyu.agent.tools.registry import ToolRegistration
from kunyu.integrations.mcp.connection import McpConnection
from kunyu.persistence.mcp import McpRepository


class McpManager:
    def __init__(self, context) -> None:
        self.context = context
        self.repository = McpRepository(context.require(s.DATABASE))
        self.tools = context.require(s.TOOLS)
        self.contexts, self.attachments = (
            context.require(s.CONTEXTS),
            context.require(s.ATTACHMENTS),
        )
        self.connections: dict[str, McpConnection] = {}
        self.disposers: dict[str, list] = {}
        self.locks: dict[str, asyncio.Lock] = {}

    def publish(self, connection: McpConnection, catalog: dict) -> int:
        row = self.repository.get(connection.config.name)
        revision = row["catalog_revision"] + int(row["catalog"] != catalog)
        self.retire(connection)
        disposers = []
        try:
            for definition in catalog["tools"]:
                disposers.append(
                    self.tools.register(
                        self.context,
                        definition["public_name"],
                        ToolRegistration(
                            partial(
                                McpTool,
                                connection=connection,
                                definition=definition,
                                catalog_revision=revision,
                                contexts=self.contexts,
                                attachments=self.attachments,
                            )
                        ),
                    )
                )
            published = self.repository.publish(
                connection.config.name, connection.revision, catalog
            )
            if published != revision:
                raise RuntimeError("MCP catalog revision changed during registration.")
        except Exception:
            for dispose in reversed(disposers):
                dispose()
            raise
        self.disposers[connection.config.name] = disposers
        return revision

    def retire(self, connection: McpConnection) -> None:
        for dispose in reversed(self.disposers.pop(connection.config.name, [])):
            dispose()

    async def activate(self, name: str) -> None:
        old = self.connections.pop(name, None)
        if old is not None:
            await old.stop()
        row = self.repository.get(name)
        if row["config"].enabled:
            connection = McpConnection(
                row["config"],
                self.repository.secrets(name),
                row["revision"],
                self.publish,
                self.retire,
            )
            self.connections[name] = connection
            connection.start()

    def view(self, name: str) -> dict:
        row = self.repository.get(name)
        connection = self.connections.get(name)
        return {
            "config": row["config"].model_dump(mode="json"),
            "revision": row["revision"],
            "catalog_revision": row["catalog_revision"],
            "catalog": row["catalog"],
            "secret_keys": row["secret_keys"],
            "updated_at": row["updated_at"].isoformat(),
            "status": connection.status if connection is not None else "disconnected",
            "error_code": connection.error_code if connection is not None else None,
            "attempt": connection.attempt if connection is not None else 0,
        }

    def instructions(self, _source) -> str:
        sections = []
        for name, connection in sorted(self.connections.items()):
            if connection.status != "connected":
                continue
            catalog = self.repository.get(name)["catalog"]
            literal = catalog["instructions"]
            text = f'MCP server "{name}" is connected. Resources declared: {"resources" in catalog["capabilities"]}.'
            if literal:
                text += f"\nServer instructions (literal text):\n{literal}"
            sections.append(text)
        return "\n\n".join(sections)

    async def close(self) -> None:
        connections = tuple(self.connections.values())
        self.connections.clear()
        results = await asyncio.gather(
            *(connection.stop() for connection in connections), return_exceptions=True
        )
        errors = [result for result in results if isinstance(result, BaseException)]
        if errors:
            raise BaseExceptionGroup("MCP connection shutdown failed.", errors)


class McpPlugin:
    name = "mcp"
    requires = (s.DATABASE, s.TOOLS, s.CONTEXTS, s.ATTACHMENTS, s.PROMPTS)
    provides = (s.MCP,)

    async def apply(self, context) -> None:
        manager = McpManager(context)
        context.provide(s.MCP, manager)
        context.effect(manager.close, before_children=True)
        register_resources(context, manager.tools, manager)
        context.require(s.PROMPTS).register(
            context,
            PromptSection(name="mcp-servers", order=80, render=manager.instructions),
        )
        for name in manager.repository.names():
            await manager.activate(name)
        # Activation is awaited once; later outages follow the bounded supervisor policy.
        await asyncio.gather(
            *(connection.ready.wait() for connection in manager.connections.values())
        )
