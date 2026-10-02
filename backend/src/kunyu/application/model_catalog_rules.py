from dataclasses import replace
from datetime import datetime

from kunyu.application.model_connections import InvalidModelConnectionError
from kunyu.domain.model_connections import (
    CapabilitySource,
    CapabilityStatus,
    CatalogAvailability,
    CatalogSource,
    CheckStatus,
    ModelCatalogEntry,
    ModelCheck,
    ModelConnection,
    ModelProviderType,
)
from kunyu.integrations.model.openai_compatible import DiscoveredModel


def merge_discovery(
    connection: ModelConnection,
    models: tuple[DiscoveredModel, ...],
    discovered_at: datetime,
) -> tuple[ModelCatalogEntry, ...]:
    fetched = {model.model_id: model for model in models}
    existing = {entry.model_id: entry for entry in connection.catalog}
    merged: list[ModelCatalogEntry] = []
    for model in models:
        efforts = model.reasoning_efforts
        if connection.provider_type is ModelProviderType.DEEPSEEK and efforts:
            # Harness uses off as its UI identity; the adapter owns wire encoding.
            efforts = ("off", *efforts)
        current = existing.get(model.model_id)
        if current is None:
            merged.append(
                replace(
                    new_catalog_entry(
                        model.model_id,
                        model.display_name,
                        (CatalogSource.FETCHED,),
                        connection.revision,
                        discovered_at,
                    ),
                    reasoning_efforts=efforts,
                    reasoning_default=model.reasoning_default,
                    reasoning_source=CapabilitySource.PROVIDER_METADATA
                    if efforts
                    else CapabilitySource.UNKNOWN,
                )
            )
            continue
        preserve_checks = (
            current.revision == connection.revision
            and current.availability is CatalogAvailability.AVAILABLE
        )
        merged.append(
            replace(
                current,
                display_name=model.display_name or current.display_name,
                sources=ordered_sources((*current.sources, CatalogSource.FETCHED)),
                revision=connection.revision,
                availability=CatalogAvailability.AVAILABLE,
                text_check=current.text_check if preserve_checks else unchecked(),
                tool_check=current.tool_check if preserve_checks else unchecked(),
                tool_capability=(
                    current.tool_capability
                    if preserve_checks
                    or current.tool_capability_source
                    is CapabilitySource.PROVIDER_METADATA
                    else CapabilityStatus.UNKNOWN
                ),
                tool_capability_source=(
                    current.tool_capability_source
                    if preserve_checks
                    or current.tool_capability_source
                    is CapabilitySource.PROVIDER_METADATA
                    else CapabilitySource.UNKNOWN
                ),
                discovered_at=discovered_at,
                reasoning_efforts=efforts,
                reasoning_default=model.reasoning_default,
                reasoning_source=CapabilitySource.PROVIDER_METADATA
                if efforts
                else CapabilitySource.UNKNOWN,
            )
        )
    for current in connection.catalog:
        if current.model_id in fetched:
            continue
        if CatalogSource.MANUAL in current.sources:
            preserve_checks = current.revision == connection.revision
            merged.append(
                replace(
                    current,
                    sources=(CatalogSource.MANUAL,),
                    revision=connection.revision,
                    availability=CatalogAvailability.AVAILABLE,
                    text_check=(current.text_check if preserve_checks else unchecked()),
                    tool_check=(current.tool_check if preserve_checks else unchecked()),
                    tool_capability=(
                        current.tool_capability
                        if preserve_checks
                        or current.tool_capability_source
                        is CapabilitySource.PROVIDER_METADATA
                        else CapabilityStatus.UNKNOWN
                    ),
                    tool_capability_source=(
                        current.tool_capability_source
                        if preserve_checks
                        or current.tool_capability_source
                        is CapabilitySource.PROVIDER_METADATA
                        else CapabilitySource.UNKNOWN
                    ),
                )
            )
            continue
        merged.append(
            replace(
                current,
                availability=CatalogAvailability.UNAVAILABLE,
                text_check=unchecked(),
                tool_check=unchecked(),
                tool_capability=(
                    current.tool_capability
                    if current.tool_capability_source
                    is CapabilitySource.PROVIDER_METADATA
                    else CapabilityStatus.UNKNOWN
                ),
                tool_capability_source=(
                    current.tool_capability_source
                    if current.tool_capability_source
                    is CapabilitySource.PROVIDER_METADATA
                    else CapabilitySource.UNKNOWN
                ),
            )
        )
    return tuple(sorted(merged, key=lambda item: item.model_id))


def new_catalog_entry(
    model_id: str,
    display_name: str | None,
    sources: tuple[CatalogSource, ...],
    revision: int,
    discovered_at: datetime | None,
) -> ModelCatalogEntry:
    return ModelCatalogEntry(
        model_id=model_id,
        display_name=display_name,
        sources=sources,
        revision=revision,
        availability=CatalogAvailability.AVAILABLE,
        enabled=False,
        text_check=unchecked(),
        tool_check=unchecked(),
        tool_capability=CapabilityStatus.UNKNOWN,
        tool_capability_source=CapabilitySource.UNKNOWN,
        reasoning_efforts=(),
        reasoning_source=CapabilitySource.UNKNOWN,
        discovered_at=discovered_at,
    )


def require_testable_entry(
    connection: ModelConnection, model_id: str
) -> ModelCatalogEntry:
    entry = find_entry(connection, model_id)
    if (
        entry is None
        or entry.revision != connection.revision
        or entry.availability is not CatalogAvailability.AVAILABLE
    ):
        raise InvalidModelConnectionError(
            "The selected model is not available for the current connection revision."
        )
    return entry


def find_entry(connection: ModelConnection, model_id: str) -> ModelCatalogEntry | None:
    return next(
        (item for item in connection.catalog if item.model_id == model_id),
        None,
    )


def ordered_sources(sources: tuple[CatalogSource, ...]) -> tuple[CatalogSource, ...]:
    unique = set(sources)
    return tuple(
        source
        for source in (CatalogSource.FETCHED, CatalogSource.MANUAL)
        if source in unique
    )


def unchecked() -> ModelCheck:
    return ModelCheck(CheckStatus.UNCHECKED, None, None)
