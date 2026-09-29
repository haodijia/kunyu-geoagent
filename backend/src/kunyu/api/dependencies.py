from fastapi import Request

from kunyu.application.connection_locks import ConnectionOperationLocks
from kunyu.application.run_lifecycle import RunLifecycleService
from kunyu.persistence.database import Database


def get_database(request: Request) -> Database:
    return request.app.state.database


def get_connection_operation_locks(request: Request) -> ConnectionOperationLocks:
    return request.app.state.connection_operation_locks


def get_run_lifecycle_service(request: Request) -> RunLifecycleService:
    return request.app.state.run_lifecycle_service
