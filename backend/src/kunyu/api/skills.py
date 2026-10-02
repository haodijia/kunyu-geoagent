"""Authenticated skill management and session-scoped user command catalogs."""

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

import yaml
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from kunyu.agent.skills.registry import SkillSummary
from kunyu.api.errors import ApiError
from kunyu.application.sessions import SessionNotFoundError
from kunyu.application.skills import SkillConflictError, SkillManagementService

router = APIRouter(prefix="/api/v1", tags=["skills"])
logger = logging.getLogger(__name__)


class SkillResponse(BaseModel):
    name: str
    description: str
    source: str
    path: str
    resource_base: str
    model_invocable: bool
    user_invocable: bool
    editable: bool

    @classmethod
    def from_summary(
        cls, summary: SkillSummary, service: SkillManagementService
    ) -> "SkillResponse":
        return cls(
            name=summary.name,
            description=summary.description,
            source=summary.source,
            path=summary.locator,
            resource_base=summary.resource_base,
            model_invocable=summary.model_invocable,
            user_invocable=summary.user_invocable,
            editable=service.editable(summary),
        )


class SkillDetailResponse(SkillResponse):
    content: str
    raw: str


class SkillCatalogResponse(BaseModel):
    directory: str
    skills: list[SkillResponse]


class SkillSaveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(min_length=1, max_length=131072)


class SkillCreateRequest(SkillSaveRequest):
    name: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=200)


class SkillImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str = Field(min_length=1, max_length=4096)


def get_skill_service(request: Request) -> SkillManagementService:
    return request.app.state.skill_service


Service = Annotated[SkillManagementService, Depends(get_skill_service)]


@contextmanager
def skill_errors() -> Iterator[None]:
    try:
        yield
    except SessionNotFoundError as error:
        raise ApiError(404, "NOT_FOUND", str(error)) from error
    except SkillConflictError as error:
        raise ApiError(409, "SKILL_CONFLICT", str(error)) from error
    except LookupError as error:
        raise ApiError(404, "SKILL_NOT_FOUND", str(error)) from error
    except (ValueError, UnicodeError, yaml.YAMLError) as error:
        logger.warning("Invalid skill: %s", error)
        raise ApiError(422, "INVALID_SKILL", str(error)) from error
    except OSError as error:
        logger.exception("Skill filesystem operation failed")
        raise ApiError(422, "SKILL_IO_ERROR", str(error)) from error


@router.get("/skills", response_model=SkillCatalogResponse)
async def list_skills(service: Service) -> SkillCatalogResponse:
    with skill_errors():
        return SkillCatalogResponse(
            directory=str(service.directory),
            skills=[
                SkillResponse.from_summary(skill, service)
                for skill in await service.list(None)
            ],
        )


@router.get("/sessions/{session_id}/skills", response_model=list[SkillResponse])
async def session_skills(session_id: str, service: Service) -> list[SkillResponse]:
    with skill_errors():
        return [
            SkillResponse.from_summary(skill, service)
            for skill in await service.list(session_id)
            if skill.user_invocable
        ]


@router.post("/skills/import", response_model=SkillResponse, status_code=201)
async def import_skill(body: SkillImportRequest, service: Service) -> SkillResponse:
    with skill_errors():
        definition = await service.import_bundle(body.path)
        return SkillResponse.from_summary(definition.summary, service)


@router.get("/skills/{name}", response_model=SkillDetailResponse)
async def skill_detail(name: str, service: Service) -> SkillDetailResponse:
    with skill_errors():
        definition = await service.get(name)
        return SkillDetailResponse(
            **SkillResponse.from_summary(definition.summary, service).model_dump(),
            content=definition.content,
            raw=await service.raw(definition),
        )


@router.post("/skills", response_model=SkillResponse, status_code=201)
async def create_skill(body: SkillCreateRequest, service: Service) -> SkillResponse:
    with skill_errors():
        definition = await service.save(body.name, body.content, create=True)
        return SkillResponse.from_summary(definition.summary, service)


@router.put("/skills/{name}", response_model=SkillResponse)
async def update_skill(
    name: str, body: SkillSaveRequest, service: Service
) -> SkillResponse:
    with skill_errors():
        definition = await service.save(name, body.content, create=False)
        return SkillResponse.from_summary(definition.summary, service)


@router.delete("/skills/{name}", status_code=204)
async def delete_skill(name: str, service: Service) -> Response:
    with skill_errors():
        await service.delete(name)
        return Response(status_code=204)
