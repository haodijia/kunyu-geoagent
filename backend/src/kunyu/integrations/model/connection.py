"""Validated provider routing and immutable per-request configuration."""

from dataclasses import dataclass, field
from urllib.parse import urlsplit

from kunyu.agent.runtime.models import ModelAdapterError, ModelErrorCode, ModelRequest
from kunyu.domain.model_connections import (
    MaxTokensField,
    ModelAuthMode,
    ModelProtocol,
    ModelProviderType,
)
from kunyu.domain.model_images import ModelImageInput


@dataclass(frozen=True, slots=True)
class ModelConnectionConfig:
    protocol: ModelProtocol
    connection_id: str
    config_revision: int
    base_url: str
    auth_mode: ModelAuthMode
    max_tokens_field: MaxTokensField
    include_usage: bool
    provider_type: ModelProviderType
    reasoning_efforts: tuple[str, ...] = ()
    image_input: ModelImageInput = field(default_factory=ModelImageInput)


def invalid_request(message: str) -> ModelAdapterError:
    return ModelAdapterError(ModelErrorCode.INVALID_REQUEST, message)


def validate_config(config: ModelConnectionConfig) -> None:
    if (
        not isinstance(config.image_input, ModelImageInput)
        or not isinstance(config.protocol, ModelProtocol)
        or not isinstance(config.provider_type, ModelProviderType)
        or not isinstance(config.connection_id, str)
        or not config.connection_id
        or not isinstance(config.base_url, str)
        or isinstance(config.config_revision, bool)
        or not isinstance(config.config_revision, int)
        or config.config_revision < 1
        or not isinstance(config.auth_mode, ModelAuthMode)
        or not isinstance(config.max_tokens_field, MaxTokensField)
        or not isinstance(config.include_usage, bool)
    ):
        raise invalid_request("The model adapter configuration is invalid.")
    efforts = config.reasoning_efforts
    if not isinstance(efforts, tuple) or any(
        not isinstance(item, str) or not item for item in efforts
    ):
        raise invalid_request("The reasoning capability configuration is invalid.")
    if len(set(efforts)) != len(efforts):
        raise invalid_request("The reasoning capability configuration is invalid.")


def validate_request(
    request: ModelRequest[ModelConnectionConfig], *, maximum_output_tokens: int
) -> None:
    config = request.adapter_config
    validate_config(config)
    if (
        not isinstance(request.run_id, str)
        or not request.run_id
        or not isinstance(request.model_id, str)
        or not request.model_id
        or request.model_id != request.model_id.strip()
        or len(request.model_id) > 256
    ):
        raise invalid_request("The model request identity is invalid.")
    if not request.messages:
        raise invalid_request("The model request must contain a message.")
    if (
        isinstance(request.max_output_tokens, bool)
        or not isinstance(request.max_output_tokens, int)
        or not 1 <= request.max_output_tokens <= maximum_output_tokens
    ):
        raise invalid_request(
            f"max_output_tokens must be between 1 and {maximum_output_tokens}."
        )
    if (
        request.reasoning_effort is not None
        and request.reasoning_effort not in config.reasoning_efforts
    ):
        raise ModelAdapterError(
            ModelErrorCode.UNSUPPORTED_CAPABILITY,
            "The selected reasoning effort is not supported by this model.",
        )


def api_root(base_url: str) -> str:
    if len(base_url) > 2_048 or any(character.isspace() for character in base_url):
        raise invalid_request("The model Base URL is invalid.")
    try:
        parsed = urlsplit(base_url)
        _ = parsed.port
    except ValueError as error:
        raise invalid_request("The model Base URL is invalid.") from error
    if (
        parsed.scheme.lower() not in {"http", "https"}
        or parsed.hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise invalid_request("The model Base URL is invalid.")
    normalized = base_url.rstrip("/")
    if not normalized:
        raise invalid_request("The model Base URL is invalid.")
    return normalized


def messages_root(base_url: str) -> str:
    root = api_root(base_url)
    return root if urlsplit(root).path.endswith("/v1") else f"{root}/v1"
