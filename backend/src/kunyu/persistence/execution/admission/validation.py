"""Validate the stored model, image capability and selected imagery before admission."""

from kunyu.domain.conversation.attachments import Attachment, AttachmentError
from kunyu.domain.execution.run_acceptance import (
    CredentialUnavailableError,
    InvalidMapContextError,
    ModelUnverifiedError,
    RunAcceptanceRequest,
    UnsupportedModelCapabilityError,
)
from kunyu.domain.geospatial.map_context import TurnMapContext
from kunyu.domain.models.model_connections import ModelAuthMode
from kunyu.domain.models.model_images import ModelImageInput
from kunyu.domain.models.model_reasoning import (
    ModelReasoningSettings,
    reasoning_parameters,
)
from kunyu.persistence.database import Database
from kunyu.persistence.geospatial.imagery import ImageryRepository
from kunyu.persistence.records.models import (
    ModelCatalogEntryRecord,
    ModelConnectionRecord,
)


def require_image_selection(database: Database, request: RunAcceptanceRequest) -> None:
    selection = TurnMapContext.model_validate(request.map_context).image_selection
    if selection is None:
        return
    candidates = ImageryRepository(database).get(
        request.session_id, selection.candidate_set_id
    )
    if not any(image.imageId == selection.image_id for image in candidates.images):
        raise InvalidMapContextError(
            "The selected image does not belong to this candidate set."
        )


def validate_model(
    connection: ModelConnectionRecord,
    entry: ModelCatalogEntryRecord | None,
    reasoning_effort: str | None,
    credential_available: bool,
) -> None:
    if not connection.enabled or connection.management_status != "ready":
        raise ModelUnverifiedError("The selected model connection is unavailable.")
    if connection.auth_mode == ModelAuthMode.API_KEY.value and not credential_available:
        raise CredentialUnavailableError(
            "The selected model credential is not configured."
        )
    if connection.credential_status != "ready":
        raise CredentialUnavailableError("The selected model credential is not ready.")
    if (
        entry is None
        or entry.revision != connection.revision
        or entry.availability != "available"
        or entry.model_id not in connection.enabled_model_ids
        or entry.text_check != "passed"
        or entry.tool_check != "passed"
    ):
        raise ModelUnverifiedError(
            "The selected model is not enabled and verified for agent runs."
        )
    declared = (
        ModelReasoningSettings.model_validate(entry.reasoning_settings)
        if entry.reasoning_settings is not None
        else None
    )
    offered = declared.levels if declared is not None else entry.reasoning_efforts
    if reasoning_effort is not None and reasoning_effort not in offered:
        raise UnsupportedModelCapabilityError(
            "The selected reasoning effort is not supported by this model."
        )

    try:
        reasoning_parameters(
            connection.protocol,
            connection.provider_type,
            reasoning_effort
            if reasoning_effort is not None or declared is not None
            else entry.reasoning_default,
            declared,
        )
    except ValueError as error:
        raise UnsupportedModelCapabilityError(str(error)) from error


def require_image_input(
    attachments: tuple[Attachment, ...], image_input: ModelImageInput
) -> None:
    if not image_input.enabled and any(ref.kind == "image" for ref in attachments):
        raise AttachmentError(
            "UNSUPPORTED_CAPABILITY",
            "Enable image input for the selected model before sending images.",
        )
