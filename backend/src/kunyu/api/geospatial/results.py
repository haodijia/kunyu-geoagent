"""Read original cells and regional statistics of workspace-owned results."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field, JsonValue

from kunyu.api.dependencies import get_database
from kunyu.api.errors import ApiError
from kunyu.application.analysis.removal import ResultRemovalService
from kunyu.application.analysis.results import ResultService
from kunyu.application.analysis.views import RasterViewService
from kunyu.application.workspaces.service import WorkspaceNotFoundError
from kunyu.domain.geospatial.raster import RasterView
from kunyu.integrations.filesystem.operation import filesystem_operation
from kunyu.persistence.database import Database

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/results", tags=["analysis"]
)


def result_service(request: Request) -> ResultService:
    return ResultService(request.app.state.analysis_service)


Service = Annotated[ResultService, Depends(result_service)]


@router.delete("/{output_id}")
def remove_result(
    workspace_id: str,
    output_id: str,
    database: Annotated[Database, Depends(get_database)],
):
    try:
        return ResultRemovalService(database).remove(workspace_id, output_id)
    except WorkspaceNotFoundError as error:
        raise ApiError(404, "WORKSPACE_NOT_FOUND", str(error)) from error
    except OSError as error:
        logging.getLogger(__name__).exception("Result file removal failed")
        raise ApiError(
            503, "RESULT_REMOVAL_FAILED", "Could not remove result files."
        ) from error


class ViewUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1)
    views: list[RasterView] = Field(min_length=1)
    default_view: str = Field(min_length=1, max_length=64)


@router.put("/{output_id}/views")
async def set_views(
    workspace_id: str, output_id: str, body: ViewUpdate, service: Service
):
    try:
        return await filesystem_operation(
            lambda cancelled: RasterViewService(
                service.analysis.repository, service.analysis.raster
            ).replace(
                workspace_id,
                output_id,
                body.expected_revision,
                body.views,
                body.default_view,
                cancelled,
            )
        )
    except OSError as error:
        logging.getLogger(__name__).exception("Raster view update failed")
        raise ApiError(
            503, "VIEW_SAVE_FAILED", "Could not save raster view files."
        ) from error


class RegionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    view_id: str | None = Field(default=None, max_length=64)
    bands: list[Annotated[int, Field(ge=1)]] | None = Field(default=None, min_length=1)
    geometry: dict[str, JsonValue]
    values: list[Annotated[float, Field(allow_inf_nan=False)]] | None = Field(
        default=None, min_length=1, max_length=32
    )


@router.get("/{output_id}/sample")
async def sample(
    workspace_id: str,
    output_id: str,
    service: Service,
    longitude: float = Query(ge=-180, le=180, allow_inf_nan=False),
    latitude: float = Query(ge=-85, le=85, allow_inf_nan=False),
    view_id: str | None = None,
    bands: Annotated[list[int] | None, Query()] = None,
):
    return await filesystem_operation(
        lambda _: service.sample(
            workspace_id, output_id, longitude, latitude, view_id, bands
        )
    )


@router.post("/{output_id}/statistics")
async def statistics(
    workspace_id: str, output_id: str, body: RegionRequest, service: Service
):
    return await filesystem_operation(
        lambda _: service.statistics(
            workspace_id,
            output_id,
            body.geometry,
            body.values,
            body.view_id,
            body.bands,
        )
    )
