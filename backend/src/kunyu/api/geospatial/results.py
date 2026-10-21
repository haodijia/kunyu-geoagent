"""Read original cells and regional statistics of workspace-owned results."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field, JsonValue

from kunyu.application.analysis.results import ResultService
from kunyu.integrations.filesystem.operation import filesystem_operation

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/results", tags=["analysis"]
)


def result_service(request: Request) -> ResultService:
    return ResultService(request.app.state.analysis_service)


Service = Annotated[ResultService, Depends(result_service)]


class RegionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
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
):
    return await filesystem_operation(
        lambda _: service.sample(workspace_id, output_id, longitude, latitude)
    )


@router.post("/{output_id}/statistics")
async def statistics(
    workspace_id: str, output_id: str, body: RegionRequest, service: Service
):
    return await filesystem_operation(
        lambda _: service.statistics(
            workspace_id, output_id, body.geometry, body.values
        )
    )
