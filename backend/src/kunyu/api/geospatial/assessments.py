"""Workspace research polygons, raster verification and reproducible report packages."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, JsonValue

from kunyu.application.analysis.assessments import AssessmentService
from kunyu.domain.geospatial.assessment import (
    Assessment,
    AssessmentRequest,
    StudyArea,
    StudyAreaWrite,
)
from kunyu.integrations.filesystem.operation import filesystem_operation

router = APIRouter(prefix="/api/v1/workspaces/{workspace_id}", tags=["assessments"])


def service(request: Request) -> AssessmentService:
    return request.app.state.assessment_service


Service = Annotated[AssessmentService, Depends(service)]


class RegionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    geometry: dict[str, JsonValue]


@router.get("/study-area", response_model=StudyArea | None)
def area(workspace_id: str, service: Service):
    return service.repository.area(workspace_id)


@router.put("/study-area", response_model=StudyArea)
def save_area(workspace_id: str, body: StudyAreaWrite, service: Service):
    return service.save_area(workspace_id, body)


@router.get("/assessments", response_model=list[Assessment])
def assessments(workspace_id: str, service: Service):
    return service.repository.list(workspace_id)


@router.post("/assessments", response_model=Assessment)
async def create_assessment(
    workspace_id: str, body: AssessmentRequest, service: Service
):
    return await filesystem_operation(
        lambda cancelled: service.build(workspace_id, None, body, cancelled)
    )


@router.get("/assessments/{assessment_id}", response_model=Assessment)
def assessment(workspace_id: str, assessment_id: str, service: Service):
    return service.repository.get(workspace_id, assessment_id)


@router.get("/assessments/{assessment_id}/files/{filename}")
def artifact(workspace_id: str, assessment_id: str, filename: str, service: Service):
    path, info = service.artifact(workspace_id, assessment_id, filename)
    return FileResponse(path, media_type=info.media_type, filename=info.filename)


@router.get("/results/{output_id}/sample")
def sample(
    workspace_id: str,
    output_id: str,
    service: Service,
    longitude: float = Query(ge=-180, le=180, allow_inf_nan=False),
    latitude: float = Query(ge=-85, le=85, allow_inf_nan=False),
):
    return service.sample(workspace_id, output_id, longitude, latitude)


@router.post("/results/{output_id}/statistics")
def statistics(
    workspace_id: str, output_id: str, body: RegionRequest, service: Service
):
    return service.statistics(workspace_id, output_id, body.geometry)
