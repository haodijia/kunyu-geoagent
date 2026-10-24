"""Workspace results, session analysis and map presentation endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict

from kunyu.api.errors import ApiError
from kunyu.application.analysis.analysis import AnalysisService
from kunyu.domain.geospatial.analysis import (
    AnalysisOutput,
    LayerStyleWrite,
    MapLayer,
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


@router.get("/workspaces/{workspace_id}/results/{output_id}/bundle")
def download_bundle(workspace_id: str, output_id: str, service: Analysis):
    output = service.repository.workspace_output(workspace_id, output_id)
    path = output.source_metadata.get("bundle_file")
    if not isinstance(path, str):
        raise ApiError(404, "BUNDLE_NOT_FOUND", "该成果没有完整数值包。")
    return FileResponse(
        service.raster.path(path),
        media_type="image/tiff",
        filename="analysis-bundle.tif",
    )


@router.get("/sessions/{session_id}/map/layers", response_model=list[MapLayer])
def layers(session_id: str, repository: Maps):
    return repository.layers(session_id)


@router.post("/sessions/{session_id}/map/layers", response_model=MapLayer)
def add_layer(session_id: str, body: OutputReference, repository: Maps):
    return repository.add(session_id, body.output_id)


@router.patch("/sessions/{session_id}/map/layers/{layer_id}", response_model=MapLayer)
def style_layer(
    session_id: str, layer_id: str, body: LayerStyleWrite, repository: Maps
):
    return repository.style(session_id, layer_id, body)


@router.delete("/sessions/{session_id}/map/layers/{layer_id}", status_code=204)
def remove_layer(session_id: str, layer_id: str, repository: Maps):
    repository.remove(session_id, layer_id)
    return Response(status_code=204)
