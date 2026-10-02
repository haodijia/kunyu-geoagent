"""Bind durable Kunyu state and credentials to the internal runner contracts."""

from kunyu.agent.runtime.models import ModelAdapterError, ModelErrorCode
from kunyu.agent.runtime.runner_types import ConfirmationRequester, RunExecution
from kunyu.application.confirmations import ConfirmationService
from kunyu.domain.model_connections import (
    MaxTokensField,
    ModelAuthMode,
    ModelProtocol,
    ModelProviderType,
)
from kunyu.integrations.model.openai_compatible_adapter import (
    OpenAICompatibleModelConfig,
)
from kunyu.persistence.model_connections import SQLAlchemyModelConnectionRepository
from kunyu.persistence.runs import SQLAlchemyEventStore


class StoredRunExecutionProvider:
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
                provider_type=ModelProviderType(snapshot.provider_type),
            ),
        )


class ServiceConfirmationRequester(ConfirmationRequester):
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
