"""Session-scoped analysis, raster bytes and map presentation endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict

from kunyu.application.analysis import AnalysisService
from kunyu.domain.analysis import (
    AnalysisError,
    AnalysisJob,
    AnalysisOutput,
    LayerStyleWrite,
    MapLayer,
    MapState,
    MapViewWrite,
)
from kunyu.persistence.maps import MapRepository

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


@router.get("/oge/services")
def services(service: Analysis):
    return [
        {
            "id": "ndvi",
            "name": "NDVI",
            "mode": service.gateway.mode,
            "inputs": ["service_defaults"],
            "output_kind": "rgb_raster",
            "numeric_ndvi_available": False,
        }
    ]


@router.get("/sessions/{session_id}/analysis/jobs", response_model=list[AnalysisJob])
def jobs(session_id: str, service: Analysis):
    return service.repository.jobs(session_id)


@router.get("/sessions/{session_id}/analysis/jobs/{job_id}", response_model=AnalysisJob)
def job(session_id: str, job_id: str, service: Analysis):
    return service.repository.job(session_id, job_id)


@router.get(
    "/sessions/{session_id}/analysis/outputs", response_model=list[AnalysisOutput]
)
def outputs(session_id: str, service: Analysis):
    return service.repository.outputs(session_id)


@router.get(
    "/sessions/{session_id}/analysis/outputs/{output_id}", response_model=AnalysisOutput
)
def output(session_id: str, output_id: str, service: Analysis):
    return service.repository.output(session_id, output_id)


@router.get("/sessions/{session_id}/analysis/outputs/{output_id}/preview")
def preview(session_id: str, output_id: str, service: Analysis):
    _, path = service.repository.files(session_id, output_id)
    return FileResponse(service.raster.path(path), media_type="image/png")


@router.get("/sessions/{session_id}/analysis/outputs/{output_id}/download")
def download(
    session_id: str,
    output_id: str,
    service: Analysis,
    kind: Annotated[str, Query(pattern="^(rendered_cog|original)$")] = "rendered_cog",
):
    result = service.repository.output(session_id, output_id)
    if kind == "original":
        raise AnalysisError(
            "OGE_ORIGINAL_UNAVAILABLE",
            f"The independent original endpoint returned HTTP {result.original_status}. No replacement was performed.",
        )
    path, _ = service.repository.files(session_id, output_id)
    return FileResponse(
        service.raster.path(path), media_type="image/tiff", filename="ndvi-display.tif"
    )


@router.get("/sessions/{session_id}/analysis/outputs/{output_id}/tiles/{z}/{x}/{y}.png")
def tile(session_id: str, output_id: str, z: int, x: int, y: int, service: Analysis):
    path, _ = service.repository.files(session_id, output_id)
    return Response(
        service.raster.tile(path, z, x, y),
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
def select_output(session_id: str, body: OutputReference, repository: Maps):
    return repository.select(session_id, body.output_id)


@router.post("/sessions/{session_id}/map/focus", response_model=MapState)
def focus_output(session_id: str, body: OutputReference, repository: Maps):
    return repository.select(session_id, body.output_id, focus=True)
