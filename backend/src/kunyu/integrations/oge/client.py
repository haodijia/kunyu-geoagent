"""Bounded OGE requests with explicit business-envelope and PNG handling."""

import logging
from typing import TypeVar

import httpx
from pydantic import (
    BaseModel,
    ConfigDict,
    JsonValue,
    SecretStr,
    TypeAdapter,
    ValidationError,
)

from kunyu.domain.attachments import MAX_ATTACHMENT_BYTES
from kunyu.domain.oge import OgeError, OgeLogin, OgeTokens

logger = logging.getLogger(__name__)
T = TypeVar("T")
MAX_JSON_BYTES = 8 * 1024 * 1024


class _Envelope(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)
    code: int
    msg: str
    data: JsonValue = None


class OgeClient:
    def __init__(self, http_client: httpx.AsyncClient) -> None:
        self._http = http_client

    async def login(self, request: OgeLogin) -> OgeTokens:
        response = await self._request(
            request.base_url,
            "POST",
            "/oauth/token",
            params={
                "scopes": "web",
                "client_id": "test",
                "client_secret": "123456",
                "grant_type": "password",
            },
            fields={
                "username": request.username,
                "password": request.password.get_secret_value(),
            },
        )
        data = self._envelope(response, login=True)
        return self.validate(OgeTokens, data)

    async def json(
        self,
        base_url: str,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        fields: dict[str, str] | None = None,
        body: dict[str, JsonValue] | None = None,
        token: SecretStr | None = None,
    ) -> JsonValue:
        return self._envelope(
            await self._request(
                base_url,
                method,
                path,
                params=params,
                fields=fields,
                body=body,
                token=token,
            )
        )

    async def preview(self, base_url: str, image_id: int) -> bytes:
        response = await self._request(
            base_url,
            "GET",
            "/data-product/image/getImagePreview",
            params={"imageId": str(image_id)},
            limit=MAX_ATTACHMENT_BYTES,
        )
        if (
            response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            == "application/json"
        ):
            self._envelope(response)
            raise OgeError(
                "OGE_PROTOCOL_ERROR", "OGE returned JSON instead of a preview image."
            )
        if (
            response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            != "image/png"
        ):
            raise OgeError("OGE_PROTOCOL_ERROR", "OGE did not return a PNG preview.")
        return response.content

    async def _request(
        self,
        base_url: str,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        fields: dict[str, str] | None = None,
        body: dict[str, JsonValue] | None = None,
        token: SecretStr | None = None,
        limit: int = MAX_JSON_BYTES,
    ) -> httpx.Response:
        try:
            async with self._http.stream(
                method,
                base_url + path,
                params=params,
                json=body,
                headers={"Authorization": "Bearer " + token.get_secret_value()}
                if token is not None
                else None,
                files={key: (None, value) for key, value in fields.items()}
                if fields is not None
                else None,
                follow_redirects=False,
                timeout=httpx.Timeout(25, connect=10),
            ) as response:
                if response.status_code in {401, 403}:
                    raise OgeError(
                        "OGE_AUTH_REJECTED", "OGE rejected authentication.", 401
                    )
                if not response.is_success:
                    raise OgeError(
                        "OGE_REMOTE_ERROR", f"OGE returned HTTP {response.status_code}."
                    )
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    if len(data) + len(chunk) > limit:
                        raise OgeError(
                            "OGE_RESPONSE_TOO_LARGE",
                            "OGE response exceeds the byte limit.",
                        )
                    data.extend(chunk)
                return httpx.Response(
                    response.status_code,
                    headers={"Content-Type": response.headers.get("content-type", "")},
                    content=bytes(data),
                )
        except httpx.TimeoutException:
            logger.warning("OGE request timed out: %s %s", method, path)
            raise OgeError("OGE_TIMEOUT", "OGE request timed out.", 504) from None
        except httpx.RequestError:
            logger.warning("OGE request failed: %s %s", method, path)
            raise OgeError("OGE_NETWORK", "Could not connect to OGE.", 503) from None
        except OgeError as error:
            logger.warning("OGE request refused: %s %s (%s)", method, path, error.code)
            raise

    @staticmethod
    def _envelope(response: httpx.Response, *, login: bool = False) -> JsonValue:
        try:
            envelope = _Envelope.model_validate_json(response.content)
        except ValidationError:
            logger.warning("OGE returned an invalid JSON envelope.")
            raise OgeError(
                "OGE_PROTOCOL_ERROR", "OGE returned an invalid response."
            ) from None
        if envelope.code != 20000:
            code = (
                "OGE_AUTH_REJECTED"
                if login or envelope.code == 40003
                else "OGE_REMOTE_ERROR"
            )
            logger.warning("OGE business request failed (code=%s).", envelope.code)
            raise OgeError(
                code,
                f"OGE request failed (code={envelope.code}).",
                401 if code == "OGE_AUTH_REJECTED" else 502,
            )
        if "data" not in envelope.model_fields_set:
            logger.warning("OGE successful response is missing data.")
            raise OgeError("OGE_PROTOCOL_ERROR", "OGE response is missing data.")
        return envelope.data

    @staticmethod
    def validate(model: type[T], data: JsonValue) -> T:
        try:
            return TypeAdapter(model).validate_python(data)
        except ValidationError:
            logger.warning(
                "OGE returned data that does not match the documented response."
            )
            raise OgeError("OGE_PROTOCOL_ERROR", "OGE returned invalid data.") from None
