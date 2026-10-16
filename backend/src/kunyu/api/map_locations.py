"""Resolve the map centre into a city without altering the session map context."""

from typing import Annotated

from fastapi import APIRouter, Query, Request

from kunyu.api.errors import ApiError
from kunyu.integrations.geocoding import GeocodingError

router = APIRouter(prefix="/api/v1/map", tags=["map"])


@router.get("/location")
async def map_location(
    request: Request,
    latitude: Annotated[float, Query(ge=-90, le=90, allow_inf_nan=False)],
    longitude: Annotated[float, Query(ge=-180, le=180, allow_inf_nan=False)],
) -> dict[str, str | None]:
    try:
        name = await request.app.state.map_geocoder.city(latitude, longitude)
    except GeocodingError as error:
        raise ApiError(502, "MAP_LOCATION_UNAVAILABLE", str(error)) from None
    return {"name": name}
