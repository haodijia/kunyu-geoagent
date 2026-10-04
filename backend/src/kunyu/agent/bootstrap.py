"""The product bundle selects providers; plugins construct the services."""

from dataclasses import dataclass

import httpx

from kunyu.agent import services as s
from kunyu.agent.commands.plugin import CommandsPlugin
from kunyu.agent.kernel import Kernel, Plugin
from kunyu.agent.plugins.core import (
    AgentHooksPlugin,
    PromptPlugin,
    ScopePlugin,
    ToolsPlugin,
    TurnServicesPlugin,
)
from kunyu.agent.plugins.infrastructure import ModelPlugin, PersistencePlugin
from kunyu.agent.plugins.loop import AgentLoopPlugin
from kunyu.agent.plugins.memory import MemoryToolsPlugin
from kunyu.agent.plugins.todo import TodoToolsPlugin
from kunyu.agent.retry import RetryPlugin
from kunyu.agent.scheduler import RunScheduler
from kunyu.agent.session_agent import AgentDirectory
from kunyu.agent.skills.plugin import (
    FilesystemSkillsPlugin,
    SkillPlugin,
    SkillToolsPlugin,
)
from kunyu.application.confirmations import ConfirmationService
from kunyu.application.connection_locks import ConnectionOperationLocks
from kunyu.application.run_lifecycle import RunLifecycleService
from kunyu.persistence.database import Database

DEFAULT_MODEL_PLUGIN = ModelPlugin()
DEFAULT_LOOP_PLUGIN = AgentLoopPlugin()


@dataclass(frozen=True, slots=True)
class AgentRuntimeBundle:
    kernel: Kernel

    @property
    def scheduler(self) -> RunScheduler:
        return self.kernel.context.require(s.SCHEDULER)

    @property
    def confirmations(self) -> ConfirmationService:
        return self.kernel.context.require(s.CONFIRMATIONS)

    @property
    def lifecycle(self) -> RunLifecycleService:
        return self.kernel.context.require(s.LIFECYCLE)

    @property
    def agents(self) -> AgentDirectory:
        return self.kernel.context.require(s.AGENTS)


async def create_agent_runtime(
    database: Database,
    http_client: httpx.AsyncClient,
    locks: ConnectionOperationLocks,
    *,
    plugins: tuple[Plugin, ...] = (),
    model_plugin: Plugin = DEFAULT_MODEL_PLUGIN,
    loop_plugin: Plugin = DEFAULT_LOOP_PLUGIN,
) -> AgentRuntimeBundle:
    kernel = Kernel()
    kernel.context.provide(s.DATABASE, database)
    kernel.context.provide(s.HTTP_CLIENT, http_client)
    kernel.context.provide(s.CONNECTION_LOCKS, locks)
    for plugin in (
        PersistencePlugin(),
        ScopePlugin(),
        model_plugin,
        AgentHooksPlugin(),
        RetryPlugin(),
        PromptPlugin(),
        ToolsPlugin(),
        MemoryToolsPlugin(),
        TodoToolsPlugin(),
        SkillPlugin(),
        FilesystemSkillsPlugin(),
        SkillToolsPlugin(),
        TurnServicesPlugin(),
        CommandsPlugin(),
        *plugins,
        loop_plugin,
    ):
        kernel.register(plugin)
    await kernel.start()
    return AgentRuntimeBundle(kernel)
