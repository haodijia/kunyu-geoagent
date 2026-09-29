"""Explicitly assemble the fixed Kunyu agent capability graph."""

from collections.abc import Mapping
from dataclasses import dataclass
from uuid import uuid4

import httpx

from dsh.host import Capability, Host
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
        self._provides = {capability: value}
        self._requires = requires

    @property
    def name(self) -> str:
        return self._name

    @property
    def provides(self) -> Mapping[Capability, object]:
        return self._provides

    @property
    def requires(self) -> frozenset[Capability]:
        return self._requires

    async def start(self, capabilities: Mapping[Capability, object]) -> None:
        for capability in self._requires:
            if capability not in capabilities:
                raise RuntimeError(
                    f"Plugin '{self._name}' is missing capability '{capability.value}'."
                )

    async def stop(self) -> None:
        return None


@dataclass(frozen=True, slots=True)
class AgentRuntimeBundle:
    host: Host
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

    host = Host()
    host.register(_StaticPlugin("events", Capability.EVENT_STORE, events))
    host.register(
        _StaticPlugin(
            "model",
            Capability.MODEL_ADAPTER,
            model,
            frozenset({Capability.EVENT_STORE}),
        )
    )
    host.register(
        _StaticPlugin(
            "context",
            Capability.CONTEXT,
            context,
            frozenset({Capability.MODEL_ADAPTER}),
        )
    )
    host.register(
        _StaticPlugin(
            "memory",
            Capability.MEMORY,
            memories,
            frozenset({Capability.CONTEXT}),
        )
    )
    host.register(
        _StaticPlugin(
            "tools",
            Capability.TOOL_REGISTRY,
            tool_registries,
            frozenset({Capability.CONTEXT, Capability.MEMORY}),
        )
    )
    host.register(
        _StaticPlugin(
            "policy",
            Capability.POLICY_GATE,
            policy,
            frozenset({Capability.TOOL_REGISTRY}),
        )
    )
    host.register(
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
    return AgentRuntimeBundle(host, scheduler, confirmations, lifecycle)
