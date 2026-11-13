"""Authenticated fixed-origin OGE proxy with streamed binary responses."""

import logging

import httpx
from fastapi import APIRouter, Request
from starlette.responses import StreamingResponse

from kunyu.api.errors import ApiError
from kunyu.domain.geospatial.oge import OgeError
from kunyu.integrations.oge.headers import oge_headers

logger = logging.getLogger(__name__)
router = APIRouter()
HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}


def clean_headers(headers) -> dict[str, str]:
    excluded = HOP_HEADERS | {
        item.strip().lower() for item in headers.get("connection", "").split(",")
    }
    return {key: value for key, value in headers.items() if key.lower() not in excluded}


@router.api_route(
    "/openge/{path:path}",
    methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
async def proxy(path: str, request: Request):
    if (
        not path.startswith("api/")
        or any(part in {"..", "."} for part in path.split("/"))
        or "\\" in path
    ):
        raise ApiError(400, "INVALID_OGE_PATH", "Only OGE API paths are accepted.")
    try:
        account = await request.app.state.oge_service.auth.account()
        authentication = oge_headers(account.tokens.token)
    except OgeError as error:
        logger.warning("OGE proxy authentication failed: %s", error.code)
        raise ApiError(error.status, error.code, str(error)) from None
    headers = clean_headers(request.headers)
    for key in list(headers):
        if key.lower() in {"cookie", "authorization", "appkey", "origin", "referer"}:
            del headers[key]
    headers.update(authentication)
    headers["host"] = "openge.org.cn"
    client = httpx.AsyncClient(
        timeout=httpx.Timeout(180, connect=15), follow_redirects=False
    )
    try:
        target = httpx.URL("https://openge.org.cn/" + path).copy_with(
            query=request.url.query.encode()
        )
        upstream = await client.send(
            client.build_request(
                request.method, target, headers=headers, content=request.stream()
            ),
            stream=True,
        )
    except httpx.HTTPError as error:
        await client.aclose()
        logger.warning("OGE proxy failed: %s", type(error).__name__)
        raise ApiError(502, "OGE_PROXY_FAILED", "OGE proxy request failed.") from error
    except BaseException:
        await client.aclose()
        raise

    async def content():
        try:
            async for chunk in upstream.aiter_raw():
                yield chunk
        except httpx.HTTPError as error:
            logger.warning("OGE proxy response interrupted: %s", type(error).__name__)
            raise
        finally:
            await upstream.aclose()
            await client.aclose()

    if upstream.status_code >= 400:
        logger.warning(
            "OGE proxy upstream rejected request: status=%d", upstream.status_code
        )
    response_headers = clean_headers(upstream.headers)
    response_headers.pop("set-cookie", None)
    return StreamingResponse(
        content(), status_code=upstream.status_code, headers=response_headers
    )
