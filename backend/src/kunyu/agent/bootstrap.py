"""Explicitly assemble the fixed Kunyu agent capability graph."""

from dataclasses import dataclass
from uuid import uuid4

import httpx

from dsh.kernel import Capability, Context, Kernel
from dsh.runner import Runner
from kunyu.agent.runner import (
    KunyuConfirmationRequester,
    KunyuRunExecutionProvider,
    SnapshotCredentialResolver,
)
from kunyu.agent.scheduler import RunScheduler
from kunyu.application.agent_context import ScopedAgentContextProvider
from kunyu.application.confirmations import ConfirmationService
from kunyu.application.connection_locks import ConnectionOperationLocks
from kunyu.application.local_tools import LocalToolPolicyGate, LocalToolRegistryFactory
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


class _StaticPlugin:
    def __init__(
        self,
        name: str,
        capability: Capability,
        value: object,
        requires: frozenset[Capability] = frozenset(),
    ) -> None:
        self._name = name
        self._capability = capability
        self._value = value
        self._requires = requires

    @property
    def name(self) -> str:
        return self._name

    @property
    def provides(self) -> frozenset[Capability]:
        return frozenset({self._capability})

    @property
    def requires(self) -> frozenset[Capability]:
        return self._requires

    async def apply(self, context: Context) -> None:
        for capability in self._requires:
            context.require(capability)
        context.provide(self._capability, self._value)


@dataclass(frozen=True, slots=True)
class AgentRuntimeBundle:
    kernel: Kernel
    scheduler: RunScheduler
    confirmations: ConfirmationService
    lifecycle: RunLifecycleService


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
    context = ScopedAgentContextProvider(contexts)
    tool_registries = LocalToolRegistryFactory(contexts, memories)
    policy = LocalToolPolicyGate()
    confirmations = ConfirmationService(database, tool_registries, policy)
    acceptance = RunAcceptanceService(
        SQLAlchemyRunAcceptanceRepository(database),
        connections,
        locks,
    )
    runner = Runner(
        KunyuRunExecutionProvider(events),
        events,
        context,
        model,
        tool_registries,
        policy,
        KunyuConfirmationRequester(confirmations),
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

    kernel = Kernel()
    kernel.register(_StaticPlugin("events", Capability.EVENT_STORE, events))
    kernel.register(
        _StaticPlugin(
            "model",
            Capability.MODEL_ADAPTER,
            model,
            frozenset({Capability.EVENT_STORE}),
        )
    )
    kernel.register(
        _StaticPlugin(
            "context",
            Capability.CONTEXT,
            context,
            frozenset({Capability.MODEL_ADAPTER}),
        )
    )
    kernel.register(
        _StaticPlugin(
            "memory",
            Capability.MEMORY,
            memories,
            frozenset({Capability.CONTEXT}),
        )
    )
    kernel.register(
        _StaticPlugin(
            "tools",
            Capability.TOOL_REGISTRY,
            tool_registries,
            frozenset({Capability.CONTEXT, Capability.MEMORY}),
        )
    )
    kernel.register(
        _StaticPlugin(
            "policy",
            Capability.POLICY_GATE,
            policy,
            frozenset({Capability.TOOL_REGISTRY}),
        )
    )
    kernel.register(
        _StaticPlugin(
            "runner",
            Capability.RUNNER,
            runner,
            frozenset(
                {
                    Capability.EVENT_STORE,
                    Capability.MODEL_ADAPTER,
                    Capability.CONTEXT,
                    Capability.TOOL_REGISTRY,
                    Capability.POLICY_GATE,
                }
            ),
        )
    )
    return AgentRuntimeBundle(kernel, scheduler, confirmations, lifecycle)
