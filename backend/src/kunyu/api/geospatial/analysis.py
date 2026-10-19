"""Workspace results, session analysis and map presentation endpoints."""

from typing import Annotated, Literal, Self

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from kunyu.api.errors import ApiError
from kunyu.application.analysis.analysis import AnalysisService
from kunyu.domain.geospatial.analysis import (
    AnalysisJob,
    AnalysisOutput,
    LayerStyleWrite,
    MapLayer,
    MapState,
    MapViewWrite,
)
from kunyu.domain.geospatial.oge import OgeError
from kunyu.persistence.geospatial.maps import MapRepository

router = APIRouter(prefix="/api/v1", tags=["analysis"])


def analysis(request: Request) -> AnalysisService:
    return request.app.state.analysis_service


def maps(request: Request) -> MapRepository:
    return request.app.state.map_repository


Analysis = Annotated[AnalysisService, Depends(analysis)]
Maps = Annotated[MapRepository, Depends(maps)]


class OutputReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    output_id: str


class LayerReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    layer_id: str


class PresentationReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["applied", "failed"]
    error: str | None = Field(default=None, min_length=1, max_length=1000)

    @model_validator(mode="after")
    def valid_error(self) -> Self:
        if (self.status == "failed") != (self.error is not None):
            raise ValueError("Only failed presentation receipts require an error.")
        return self


@router.delete("/sessions/{session_id}/map/selection", response_model=MapState)
def clear_image_selection(session_id: str, repository: Maps):
    return repository.clear_image_selection(session_id)


@router.get("/sessions/{session_id}/map/layers/{layer_id}/preview")
async def layer_preview(
    session_id: str,
    layer_id: str,
    request: Request,
    repository: Maps,
    service: Analysis,
):
    layer = repository.layer(session_id, layer_id)
    if layer.image is not None:
        try:
            raw = await request.app.state.oge_service.image_preview(
                layer.image.image_id
            )
        except OgeError as error:
            raise ApiError(error.status, error.code, str(error)) from None
        return Response(raw, media_type="image/png")
    output = repository.outputs.output(session_id, layer.output_id)
    _, path = repository.outputs.files(output.workspace_id, output.id)
    return FileResponse(service.raster.path(path), media_type="image/png")


@router.put(
    "/sessions/{session_id}/map/presentations/{request_id}", response_model=MapState
)
def presentation_receipt(
    session_id: str, request_id: str, receipt: PresentationReceipt, repository: Maps
):
    return repository.receipt(session_id, request_id, receipt.status, receipt.error)


@router.get("/sessions/{session_id}/analysis/jobs", response_model=list[AnalysisJob])
def jobs(session_id: str, service: Analysis):
    return service.repository.jobs(session_id)


@router.get("/sessions/{session_id}/analysis/jobs/{job_id}", response_model=AnalysisJob)
def job(session_id: str, job_id: str, service: Analysis):
    return service.repository.job(session_id, job_id)


@router.get("/workspaces/{workspace_id}/results", response_model=list[AnalysisOutput])
def workspace_outputs(workspace_id: str, service: Analysis):
    return service.repository.workspace_outputs(workspace_id)


@router.get(
    "/workspaces/{workspace_id}/results/{output_id}", response_model=AnalysisOutput
)
def workspace_output(workspace_id: str, output_id: str, service: Analysis):
    return service.repository.workspace_output(workspace_id, output_id)


@router.get("/workspaces/{workspace_id}/results/{output_id}/preview")
def preview(workspace_id: str, output_id: str, service: Analysis):
    _, path = service.repository.files(workspace_id, output_id)
    return FileResponse(service.raster.path(path), media_type="image/png")


@router.get("/workspaces/{workspace_id}/results/{output_id}/download")
def download(
    workspace_id: str,
    output_id: str,
    service: Analysis,
):
    path, _ = service.repository.files(workspace_id, output_id)
    return FileResponse(
        service.raster.path(path),
        media_type="image/tiff",
        filename="analysis-result.tif",
    )


@router.get("/workspaces/{workspace_id}/results/{output_id}/tiles/{z}/{x}/{y}.png")
def tile(workspace_id: str, output_id: str, z: int, x: int, y: int, service: Analysis):
    path, _ = service.repository.files(workspace_id, output_id)
    return Response(
        service.raster.tile(
            path,
            z,
            x,
            y,
            service.repository.workspace_output(workspace_id, output_id).metadata,
        ),
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/sessions/{session_id}/map", response_model=MapState)
def map_state(session_id: str, repository: Maps):
    return repository.state(session_id)


@router.put("/sessions/{session_id}/map", response_model=MapState)
def map_view(session_id: str, body: MapViewWrite, repository: Maps):
    return repository.view(session_id, body)


@router.get("/sessions/{session_id}/map/layers", response_model=list[MapLayer])
def layers(session_id: str, repository: Maps):
    return repository.layers(session_id)


@router.post("/sessions/{session_id}/map/layers", response_model=MapLayer)
def add_layer(session_id: str, body: OutputReference, repository: Maps):
    return repository.add(session_id, body.output_id)


@router.put("/sessions/{session_id}/map/layers/{layer_id}", response_model=MapLayer)
def style_layer(
    session_id: str, layer_id: str, body: LayerStyleWrite, repository: Maps
):
    return repository.style(session_id, layer_id, body)


@router.delete("/sessions/{session_id}/map/layers/{layer_id}", status_code=204)
def remove_layer(
    session_id: str, layer_id: str, expected_revision: int, repository: Maps
):
    repository.remove(session_id, layer_id, expected_revision)
    return Response(status_code=204)


@router.post("/sessions/{session_id}/map/select", response_model=MapState)
def select_layer(session_id: str, body: LayerReference, repository: Maps):
    return repository.select(session_id, body.layer_id)


@router.post("/sessions/{session_id}/map/focus", response_model=MapState)
def focus_layer(session_id: str, body: LayerReference, repository: Maps):
    return repository.select(session_id, body.layer_id, focus=True)
