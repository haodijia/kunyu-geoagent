"""Model connection HTTP dependencies."""

from typing import Annotated

from fastapi import Depends, Request

from kunyu.api.dependencies import (
    get_connection_operation_locks,
    get_database,
    get_run_lifecycle_service,
)
from kunyu.application.execution.run_lifecycle import RunLifecycleService
from kunyu.application.models.catalog.service import ModelCatalogService
from kunyu.application.models.connection_locks import ConnectionOperationLocks
from kunyu.application.models.credentials import ModelCredentialService
from kunyu.application.models.model_connections import ModelConnectionService
from kunyu.application.models.model_discovery_tasks import ModelDiscoveryTasks
from kunyu.persistence.database import Database
from kunyu.persistence.models.connections import SQLAlchemyModelConnectionRepository


def get_model_connection_service(
    database: Annotated[Database, Depends(get_database)],
    locks: Annotated[ConnectionOperationLocks, Depends(get_connection_operation_locks)],
    run_lifecycle: Annotated[RunLifecycleService, Depends(get_run_lifecycle_service)],
) -> ModelConnectionService:
    return ModelConnectionService(
        SQLAlchemyModelConnectionRepository(database),
        locks,
        run_lifecycle,
    )


ModelConnectionServiceDependency = Annotated[
    ModelConnectionService, Depends(get_model_connection_service)
]


def get_model_credential_service(
    database: Annotated[Database, Depends(get_database)],
    locks: Annotated[ConnectionOperationLocks, Depends(get_connection_operation_locks)],
    run_lifecycle: Annotated[RunLifecycleService, Depends(get_run_lifecycle_service)],
) -> ModelCredentialService:
    repository = SQLAlchemyModelConnectionRepository(database)
    return ModelCredentialService(
        repository,
        repository,
        locks,
        run_lifecycle,
    )


ModelCredentialServiceDependency = Annotated[
    ModelCredentialService, Depends(get_model_credential_service)
]


def get_model_discovery_tasks(request: Request) -> ModelDiscoveryTasks:
    return request.app.state.model_discovery_tasks


def get_model_catalog_service(request: Request) -> ModelCatalogService:
    return request.app.state.model_catalog_service


ModelDiscoveryTasksDependency = Annotated[
    ModelDiscoveryTasks, Depends(get_model_discovery_tasks)
]


ModelCatalogServiceDependency = Annotated[
    ModelCatalogService, Depends(get_model_catalog_service)
]
