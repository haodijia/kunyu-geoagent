from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.api.workspaces.files import file_error
from kunyu.application.workspaces.knowledge import (
    KnowledgeConflictError,
    MemoryNotFoundError,
    WorkspaceKnowledgeService,
)
from kunyu.application.workspaces.service import WorkspaceNotFoundError
from kunyu.domain.workspaces.filesystem import FilesystemError
from kunyu.domain.workspaces.overview import MemoryItem
from kunyu.persistence.database import Database

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}", tags=["workspace-knowledge"]
)


class MemoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    content: str = Field(min_length=1, max_length=2000)


class MemoryUpdate(MemoryCreate):
    expected_content: str = Field(min_length=1, max_length=2000)


class InstructionDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(max_length=128 * 1024)
    version: str | None = Field(max_length=200)


def get_service(
    database: Annotated[Database, Depends(get_database)],
) -> WorkspaceKnowledgeService:
    return WorkspaceKnowledgeService(database)


Service = Annotated[WorkspaceKnowledgeService, Depends(get_service)]


def knowledge_error(error: Exception) -> ApiError:
    if isinstance(error, (WorkspaceNotFoundError, FilesystemError)):
        if isinstance(error, FilesystemError) and error.code == "FS_TOO_LARGE":
            return ApiError(413, "INSTRUCTIONS_TOO_LARGE", str(error))
        if isinstance(error, FilesystemError) and error.code in {
            "FS_STALE_VERSION",
            "FS_NOT_OBSERVED",
        }:
            return ApiError(409, "KNOWLEDGE_CONFLICT", str(error))
        return file_error(error)
    if isinstance(error, MemoryNotFoundError):
        return ApiError(404, "MEMORY_NOT_FOUND", str(error))
    return ApiError(409, "KNOWLEDGE_CONFLICT", str(error))


@router.post("/memories", response_model=MemoryItem, status_code=201)
def create_memory(workspace_id: str, body: MemoryCreate, service: Service):
    try:
        return service.save_memory(workspace_id, body.content, None, None)
    except WorkspaceNotFoundError as error:
        raise knowledge_error(error) from error


@router.patch("/memories/{memory_id}", response_model=MemoryItem)
def edit_memory(
    workspace_id: str, memory_id: str, body: MemoryUpdate, service: Service
):
    try:
        return service.save_memory(
            workspace_id, body.content, memory_id, body.expected_content
        )
    except (
        WorkspaceNotFoundError,
        KnowledgeConflictError,
        MemoryNotFoundError,
    ) as error:
        raise knowledge_error(error) from error


@router.get("/instructions", response_model=InstructionDocument)
def instructions(workspace_id: str, service: Service):
    try:
        return service.instructions(workspace_id)
    except (WorkspaceNotFoundError, FilesystemError, KnowledgeConflictError) as error:
        raise knowledge_error(error) from error


@router.put("/instructions", response_model=InstructionDocument)
def save_instructions(workspace_id: str, body: InstructionDocument, service: Service):
    try:
        return service.save_instructions(workspace_id, body.content, body.version)
    except (WorkspaceNotFoundError, FilesystemError) as error:
        raise knowledge_error(error) from error
