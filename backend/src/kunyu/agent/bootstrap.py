"""Assemble the application agent and register its tools explicitly."""

from dataclasses import dataclass
from functools import partial
from uuid import uuid4

import httpx

from kunyu.agent.adapters import (
    ServiceConfirmationRequester,
    SnapshotCredentialResolver,
    StoredRunExecutionProvider,
)
from kunyu.agent.context import (
    ScopedAgentContextProvider,
    create_prompt_registry,
)
from kunyu.agent.runtime.runner import Runner
from kunyu.agent.scheduler import RunScheduler
from kunyu.agent.session_agent import AgentDirectory
from kunyu.agent.tools.memory import MemoryReadTool, MemoryWriteHandler, MemoryWriteTool
from kunyu.agent.tools.registry import ToolPolicyGate, ToolRegistryFactory
from kunyu.application.confirmations import ConfirmationService
from kunyu.application.connection_locks import ConnectionOperationLocks
from kunyu.application.run_acceptance import RunAcceptanceService
from kunyu.application.run_lifecycle import RunLifecycleService
from kunyu.integrations.model.openai_compatible_adapter import (
    OpenAICompatibleModelAdapter,
)
from kunyu.persistence.agent_context import SQLAlchemyRunContextRepository
from kunyu.persistence.database import Database
from kunyu.persistence.model_connections import SQLAlchemyModelConnectionRepository
from kunyu.persistence.run_acceptance import SQLAlchemyRunAcceptanceRepository
from kunyu.persistence.run_lifecycle import SQLAlchemyRunLifecycleRepository
from kunyu.persistence.runs import SQLAlchemyEventStore
from kunyu.persistence.workspace_memory import SQLAlchemyWorkspaceMemoryRepository


@dataclass(frozen=True, slots=True)
class AgentRuntimeBundle:
    scheduler: RunScheduler
    confirmations: ConfirmationService
    lifecycle: RunLifecycleService
    agents: AgentDirectory


def create_agent_runtime(
    database: Database,
    http_client: httpx.AsyncClient,
    locks: ConnectionOperationLocks,
) -> AgentRuntimeBundle:
    events = SQLAlchemyEventStore(database)
    connections = SQLAlchemyModelConnectionRepository(database)
    contexts = SQLAlchemyRunContextRepository(database)
    memories = SQLAlchemyWorkspaceMemoryRepository(database)
    model = OpenAICompatibleModelAdapter(
        http_client,
        SnapshotCredentialResolver(connections),
    )
    context = ScopedAgentContextProvider(contexts, create_prompt_registry())
    tool_registries = ToolRegistryFactory(
        builders=(
            partial(MemoryReadTool, contexts=contexts, memories=memories),
            partial(MemoryWriteTool, contexts=contexts),
        ),
        write_handlers={
            "memory_write": MemoryWriteHandler(lambda: f"mem_{uuid4().hex}"),
        },
    )
    policy = ToolPolicyGate(tool_registries)
    confirmations = ConfirmationService(database, tool_registries, policy)
    acceptance = RunAcceptanceService(
        SQLAlchemyRunAcceptanceRepository(database),
        connections,
        locks,
    )
    runner = Runner(
        StoredRunExecutionProvider(events),
        events,
        context,
        model,
        tool_registries,
        policy,
        ServiceConfirmationRequester(confirmations),
        message_id_factory=lambda: f"msg_{uuid4().hex}",
        tool_call_id_factory=lambda: f"tlc_{uuid4().hex}",
        operation_id_factory=lambda: f"op_{uuid4().hex}",
    )
    lifecycle_repository = SQLAlchemyRunLifecycleRepository(database)
    lifecycle = RunLifecycleService(lifecycle_repository, events)
    scheduler = RunScheduler(
        runner,
        lifecycle,
        lifecycle_repository,
        confirmations,
        acceptance,
    )

    return AgentRuntimeBundle(
        scheduler,
        confirmations,
        lifecycle,
        AgentDirectory(scheduler, lifecycle, database),
    )
