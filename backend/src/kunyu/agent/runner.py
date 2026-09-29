"""Bind durable Kunyu state and local capabilities to the DSH runner."""

from uuid import uuid4

import httpx

from dsh.models import ModelAdapterError, ModelErrorCode
from dsh.runner import Runner
from dsh.runner_types import ConfirmationRequester, RunExecution
from kunyu.application.agent_context import ScopedAgentContextProvider
from kunyu.application.confirmations import ConfirmationService
from kunyu.application.local_tools import LocalToolPolicyGate, LocalToolRegistryFactory
from kunyu.domain.model_connections import MaxTokensField, ModelAuthMode, ModelProtocol
from kunyu.integrations.model.openai_compatible_adapter import (
    OpenAICompatibleModelAdapter,
    OpenAICompatibleModelConfig,
)
from kunyu.persistence.agent_context import SQLAlchemyRunContextRepository
from kunyu.persistence.database import Database
from kunyu.persistence.model_connections import SQLAlchemyModelConnectionRepository
from kunyu.persistence.runs import SQLAlchemyEventStore
from kunyu.persistence.workspace_memory import SQLAlchemyWorkspaceMemoryRepository


class KunyuRunExecutionProvider:
    def __init__(self, events: SQLAlchemyEventStore) -> None:
        self._events = events

    async def get(
        self, run_id: str
    ) -> RunExecution[OpenAICompatibleModelConfig] | None:
        run = self._events.get_reduced_run(run_id)
        if run is None:
            return None
        snapshot = run.model_snapshot
        if snapshot.protocol != ModelProtocol.OPENAI_COMPATIBLE.value:
            raise ModelAdapterError(
                ModelErrorCode.UNSUPPORTED_CAPABILITY,
                "The run snapshot uses an unsupported model protocol.",
            )
        reasoning_efforts = (
            (snapshot.reasoning_effort,)
            if snapshot.reasoning_effort is not None
            else ()
        )
        return RunExecution(
            run=run,
            adapter_config=OpenAICompatibleModelConfig(
                connection_id=snapshot.connection_id,
                config_revision=snapshot.connection_revision,
                base_url=snapshot.base_url,
                auth_mode=ModelAuthMode(snapshot.auth_mode),
                max_tokens_field=MaxTokensField(snapshot.max_tokens_field),
                include_usage=snapshot.include_usage,
                reasoning_efforts=reasoning_efforts,
            ),
        )


class KunyuConfirmationRequester(ConfirmationRequester):
    def __init__(self, service: ConfirmationService) -> None:
        self._service = service

    async def request(self, run_id: str, tool_call_id: str) -> None:
        self._service.request(run_id, tool_call_id)


class SnapshotCredentialResolver:
    def __init__(self, repository: SQLAlchemyModelConnectionRepository) -> None:
        self._repository = repository

    async def __call__(self, connection_id: str, config_revision: int) -> str | None:
        connection = self._repository.get(connection_id)
        if connection is None or connection.revision != config_revision:
            raise ModelAdapterError(
                ModelErrorCode.CREDENTIAL_UNAVAILABLE,
                "The run credential revision is no longer available.",
            )
        if connection.auth_mode is ModelAuthMode.NONE:
            return None
        api_key = self._repository.get_api_key(connection_id)
        if api_key is None:
            raise ModelAdapterError(
                ModelErrorCode.PROVIDER_AUTH,
                "The model credential is not configured.",
            )
        return api_key


def create_agent_runner(
    database: Database,
    http_client: httpx.AsyncClient,
) -> Runner[OpenAICompatibleModelConfig]:
    events = SQLAlchemyEventStore(database)
    contexts = SQLAlchemyRunContextRepository(database)
    memories = SQLAlchemyWorkspaceMemoryRepository(database)
    tool_registries = LocalToolRegistryFactory(contexts, memories)
    policy = LocalToolPolicyGate()
    confirmations = ConfirmationService(
        database,
        tool_registries,
        policy,
    )
    connections = SQLAlchemyModelConnectionRepository(database)
    model = OpenAICompatibleModelAdapter(
        http_client,
        SnapshotCredentialResolver(connections),
    )
    return Runner(
        KunyuRunExecutionProvider(events),
        events,
        ScopedAgentContextProvider(contexts),
        model,
        tool_registries,
        policy,
        KunyuConfirmationRequester(confirmations),
        message_id_factory=lambda: f"msg_{uuid4().hex}",
        tool_call_id_factory=lambda: f"tlc_{uuid4().hex}",
        operation_id_factory=lambda: f"op_{uuid4().hex}",
    )
