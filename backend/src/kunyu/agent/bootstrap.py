"""The product bundle selects providers; plugins construct the services."""

from dataclasses import dataclass

import httpx

from kunyu.agent.commands.plugin import CommandsPlugin
from kunyu.agent.core import services as s
from kunyu.agent.core.kernel import Kernel, Plugin
from kunyu.agent.mcp.plugin import McpPlugin
from kunyu.agent.orchestration.retry import RetryPlugin
from kunyu.agent.orchestration.scheduler import RunScheduler
from kunyu.agent.orchestration.session_agent import AgentDirectory
from kunyu.agent.plugins.analysis import AnalysisPlugin
from kunyu.agent.plugins.attachments import AttachmentToolsPlugin
from kunyu.agent.plugins.compaction import CompactionPlugin
from kunyu.agent.plugins.core import (
    AgentHooksPlugin,
    PromptPlugin,
    ScopePlugin,
    ToolsPlugin,
    TurnServicesPlugin,
)
from kunyu.agent.plugins.filesystem import (
    FilesystemObservationPlugin,
    FilesystemPlugin,
    FilesystemToolsPlugin,
)
from kunyu.agent.plugins.image_offload import ImageOffloadPlugin
from kunyu.agent.plugins.infrastructure import ModelPlugin, PersistencePlugin
from kunyu.agent.plugins.jobs import JobsPlugin, JobToolsPlugin
from kunyu.agent.plugins.loop import AgentLoopPlugin
from kunyu.agent.plugins.memory import MemoryToolsPlugin
from kunyu.agent.plugins.model_providers import (
    DeepSeekModelProviderPlugin,
    ModelProvidersPlugin,
    SDKModelProviderPlugin,
)
from kunyu.agent.plugins.oge import OgePlugin
from kunyu.agent.plugins.plan_mode import PlanModePlugin
from kunyu.agent.plugins.questions import UserQuestionsPlugin
from kunyu.agent.plugins.runtime_context import RuntimeContextPlugin
from kunyu.agent.plugins.search import SearchPlugin
from kunyu.agent.plugins.subagents import SubagentsPlugin
from kunyu.agent.plugins.todo import TodoToolsPlugin
from kunyu.agent.skills.plugin import (
    FilesystemSkillsPlugin,
    SkillPlugin,
    SkillToolsPlugin,
)
from kunyu.application.execution.confirmations import ConfirmationService
from kunyu.application.execution.run_lifecycle import RunLifecycleService
from kunyu.application.models.connection_locks import ConnectionOperationLocks
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
        FilesystemPlugin(),
        FilesystemObservationPlugin(),
        ModelProvidersPlugin(),
        DeepSeekModelProviderPlugin(),
        SDKModelProviderPlugin(),
        model_plugin,
        AgentHooksPlugin(),
        ImageOffloadPlugin(),
        CompactionPlugin(),
        RetryPlugin(),
        PromptPlugin(),
        ToolsPlugin(),
        JobsPlugin(),
        MemoryToolsPlugin(),
        AttachmentToolsPlugin(),
        OgePlugin(),
        AnalysisPlugin(),
        FilesystemToolsPlugin(),
        SearchPlugin(),
        TodoToolsPlugin(),
        SubagentsPlugin(),
        RuntimeContextPlugin(),
        SkillPlugin(),
        FilesystemSkillsPlugin(),
        SkillToolsPlugin(),
        McpPlugin(),
        TurnServicesPlugin(),
        UserQuestionsPlugin(),
        PlanModePlugin(),
        CommandsPlugin(),
        *plugins,
        loop_plugin,
        JobToolsPlugin(),
    ):
        kernel.register(plugin)
    await kernel.start()
    return AgentRuntimeBundle(kernel)
