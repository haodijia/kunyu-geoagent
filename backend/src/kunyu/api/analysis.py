"""Session-scoped analysis, raster bytes and map presentation endpoints."""

from typing import Annotated, Literal, Self

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from kunyu.api.errors import ApiError
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
from kunyu.domain.imagery import image_ring
from kunyu.domain.oge import OgeError
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


class ImageSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_set_id: str = Field(min_length=1, max_length=128)
    image_id: int | None = Field(gt=0)


class PresentationReceipt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["applied", "failed"]
    error: str | None = Field(default=None, min_length=1, max_length=1000)

    @model_validator(mode="after")
    def valid_error(self) -> Self:
        if (self.status == "failed") != (self.error is not None):
            raise ValueError("Only failed presentation receipts require an error.")
        return self


@router.get("/sessions/{session_id}/imagery/{candidate_set_id}")
def image_candidates(session_id: str, candidate_set_id: str, repository: Maps):
    candidates = repository.imagery.get(session_id, candidate_set_id)
    return {
        "id": candidates.id,
        "session_id": session_id,
        "images": [
            {**image.model_dump(mode="json"), "footprint": image_ring(image)}
            for image in candidates.images
        ],
    }


@router.get(
    "/sessions/{session_id}/imagery/{candidate_set_id}/images/{image_id}/preview"
)
async def candidate_preview(
    session_id: str,
    candidate_set_id: str,
    image_id: int,
    request: Request,
    repository: Maps,
):
    candidates = repository.imagery.get(session_id, candidate_set_id)
    if not any(image.imageId == image_id for image in candidates.images):
        raise AnalysisError(
            "INVALID_IMAGE", "The image is not in this candidate set.", 404
        )
    try:
        raw = await request.app.state.oge_service.image_preview(image_id)
    except OgeError as error:
        raise ApiError(error.status, error.code, str(error)) from None
    return Response(raw, media_type="image/png")


@router.put("/sessions/{session_id}/map/selection", response_model=MapState)
def select_image(session_id: str, selection: ImageSelection, repository: Maps):
    return repository.choose_image(
        session_id,
        selection.candidate_set_id,
        selection.image_id,
    )


@router.put(
    "/sessions/{session_id}/map/presentations/{request_id}", response_model=MapState
)
def presentation_receipt(
    session_id: str, request_id: str, receipt: PresentationReceipt, repository: Maps
):
    return repository.receipt(session_id, request_id, receipt.status, receipt.error)


@router.get("/oge/services")
def services(service: Analysis):
    return [
        {
            "id": "ndvi",
            "name": "NDVI",
            "mode": service.gateway.mode,
            "inputs": ["selected_image", "service_defaults"],
            "selected_image_products": service.gateway.selected_image_products,
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
