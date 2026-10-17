"""Human-owned account endpoints; token values never leave the backend."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from kunyu.api.errors import ApiError
from kunyu.application.analysis.oge import OgeService
from kunyu.domain.geospatial.oge import OgeAccountStatus, OgeError, OgeLogin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/oge/account", tags=["oge"])


def get_oge_service(request: Request) -> OgeService:
    return request.app.state.oge_service


Service = Annotated[OgeService, Depends(get_oge_service)]


def api_error(error: OgeError) -> ApiError:
    logger.warning("OGE account operation failed (%s).", error.code)
    return ApiError(error.status, error.code, str(error))


@router.get("", response_model=OgeAccountStatus)
async def account_status(service: Service) -> OgeAccountStatus:
    try:
        return await service.status()
    except OgeError as error:
        raise api_error(error) from None


@router.post("/login", response_model=OgeAccountStatus)
async def login(request: OgeLogin, service: Service) -> OgeAccountStatus:
    try:
        return await service.login(request)
    except OgeError as error:
        raise api_error(error) from None


@router.delete("", response_model=OgeAccountStatus)
async def logout(service: Service) -> OgeAccountStatus:
    try:
        return await service.logout()
    except OgeError as error:
        raise api_error(error) from None
