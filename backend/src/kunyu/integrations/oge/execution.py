"""The verified NDVI GP protocol, with an explicit live or recorded transport."""

import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel, Field, JsonValue, SecretStr

from kunyu.domain.analysis import AnalysisError
from kunyu.domain.oge import OgeAccount, OgeError
from kunyu.integrations.oge.client import OgeClient
from kunyu.integrations.oge.recording import OgeReplayTransport
from kunyu.persistence.oge import OgeAccountStore

BASE_URL = "https://openge.org.cn/api"
NDVI_PATH = "/management/gp-service/process/NDVI/api"
RECORDING = Path(__file__).with_name("fixtures") / "ndvi-default"


class Submitted(BaseModel):
    processId: str = Field(pattern=r"^job-[A-Za-z0-9-]+$")


class ExecutionGateway:
    selected_image_products = ("LC08_C02_L1",)

    def __init__(self, http: httpx.AsyncClient, accounts: OgeAccountStore) -> None:
        self._http, self._accounts = http, accounts
        self.mode = os.environ.get("KUNYU_OGE_EXECUTION_MODE", "live")
        if self.mode not in {"replay", "live"}:
            raise ValueError("KUNYU_OGE_EXECUTION_MODE must be replay or live.")
        self.source_metadata = json.loads(
            (RECORDING / "raster-metadata.json").read_text()
        )

    def subject(self) -> tuple[str | None, str | None]:
        if self.mode == "replay":
            return None, None
        account = self.account()
        return account.username, account.base_url

    def binding(self) -> str:
        if self.mode == "replay":
            return "oge:ndvi:gp-v2:replay:ndvi-default-v2"
        account = self._accounts.read()
        subject = "unconfigured" if account is None else account.username
        return f"oge:ndvi:gp-v2:live:{subject}"

    def account(
        self, subject: str | None = None, base_url: str | None = None
    ) -> OgeAccount:
        account = self._accounts.read()
        if account is None:
            raise OgeError("OGE_AUTH_REQUIRED", "Log in to OGE in settings.", 401)
        if account.tokens.exp <= time.time():
            raise OgeError("OGE_AUTH_EXPIRED", "OGE login expired; log in again.", 401)
        url = urlsplit(account.base_url)
        if url.hostname != "openge.org.cn" or url.path.rstrip("/") != "/api":
            raise OgeError(
                "OGE_ACCOUNT_ENDPOINT",
                "NDVI requires the verified openge.org.cn account endpoint.",
                409,
            )
        if subject is not None and (account.username, account.base_url) != (
            subject,
            base_url,
        ):
            raise OgeError(
                "OGE_ACCOUNT_CHANGED",
                "Log in with the account that submitted this analysis.",
                409,
            )
        return account

    @asynccontextmanager
    async def client(self, mode: str):
        if mode == "replay":
            async with httpx.AsyncClient(
                transport=OgeReplayTransport(RECORDING)
            ) as client:
                yield client
        elif mode == "live":
            yield self._http
        else:
            raise AnalysisError("INVALID_EXECUTION_MODE", "Unknown execution mode.")

    def token(
        self, mode: str, subject: str | None = None, base_url: str | None = None
    ) -> SecretStr | None:
        return (
            None if mode == "replay" else self.account(subject, base_url).tokens.token
        )

    async def submit(
        self,
        mode: str,
        subject: str | None,
        base_url: str | None,
        parameters: dict[str, JsonValue],
    ) -> str:
        body: dict[str, JsonValue] = {}
        path = NDVI_PATH
        if parameters["input_mode"] == "selected_image":
            if mode != "live":
                raise OgeError(
                    "OGE_LIVE_REQUIRED",
                    "Selected-image NDVI requires live execution; the recording uses a different fixed input.",
                    409,
                )
            definition = await OgeClient(self._http).json(
                BASE_URL,
                "GET",
                "/management/gp-service/toolbox/NDVI",
                token=self.token(mode, subject, base_url),
            )
            if (
                not isinstance(definition, dict)
                or definition.get("serviceName") != "NDVI"
                or not isinstance(definition.get("uuid"), str)
                or not isinstance(definition.get("params"), list)
                or {
                    item.get("name")
                    for item in definition["params"]
                    if isinstance(item, dict)
                }
                != {"coverageID", "productID"}
            ):
                raise OgeError(
                    "OGE_SERVICE_CHANGED",
                    "The published NDVI service no longer matches its verified input contract.",
                    409,
                )
            body = {
                "serviceUuid": definition["uuid"],
                "taskName": parameters["task_name"],
                "params": {
                    "coverageID": parameters["coverageID"],
                    "productID": parameters["productID"],
                },
                "resultMode": "fileAndService",
            }
            # The toolbox page contract consumes nested params; /api does not.
            path = "/management/gp-service/process/NDVI/page"
        async with self.client(mode) as http:
            data = await OgeClient(http).json(
                BASE_URL,
                "POST",
                path,
                body=body,
                token=self.token(mode, subject, base_url),
            )
            return OgeClient.validate(Submitted, data).processId

    async def status(
        self, mode: str, remote_id: str, subject: str | None, base_url: str | None
    ) -> dict:
        async with self.client(mode) as http:
            value = await OgeClient(http).json(
                BASE_URL,
                "GET",
                f"/computation-api/process/{remote_id}",
                token=self.token(mode, subject, base_url),
            )
            if not isinstance(value, dict) or value.get("recordId") != remote_id:
                raise OgeError(
                    "OGE_PROTOCOL_ERROR", "The NDVI status identity is invalid."
                )
            status = value.get("resultStatus")
            if status not in (0, 1):
                raise OgeError(
                    "OGE_UNKNOWN_STATUS",
                    "This NDVI GP status has not been verified; no generic status mapping was applied.",
                )
            return value

    async def result(
        self, mode: str, remote_id: str, subject: str | None, base_url: str | None
    ) -> dict:
        async with self.client(mode) as http:
            value = await OgeClient(http).json(
                BASE_URL,
                "GET",
                f"/computation-api/process/result/{remote_id}",
                token=self.token(mode, subject, base_url),
            )
            if (
                not isinstance(value, dict)
                or value.get("jobId") != remote_id
                or value.get("status") != "success"
            ):
                raise OgeError(
                    "OGE_PROTOCOL_ERROR",
                    "NDVI result metadata is not a successful result for this job.",
                )
            return value

    async def cog(
        self,
        mode: str,
        remote_id: str,
        subject: str | None,
        base_url: str | None,
        target: Path,
    ) -> None:
        token = self.token(mode, subject, base_url)
        headers = (
            {}
            if token is None
            else {"Authorization": "Bearer " + token.get_secret_value()}
        )
        partial = target.with_suffix(".partial.tif")
        try:
            async with (
                self.client(mode) as http,
                http.stream(
                    "GET",
                    BASE_URL + f"/computation-api/styles/cog/{remote_id}",
                    headers=headers,
                    follow_redirects=False,
                    timeout=httpx.Timeout(180, connect=15),
                ) as response,
            ):
                if response.status_code in {401, 403}:
                    raise OgeError(
                        "OGE_AUTH_REQUIRED",
                        "Restore the original OGE account login before reading its result.",
                        response.status_code,
                    )
                if (
                    response.status_code != 200
                    or response.headers.get("content-type", "").split(";")[0]
                    != "image/tiff"
                ):
                    raise OgeError(
                        "OGE_PROTOCOL_ERROR",
                        "NDVI COG endpoint did not return image/tiff.",
                    )
                size = 0
                with partial.open("wb") as stream:
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > 2 * 1024 * 1024 * 1024:
                            raise OgeError(
                                "OGE_RESPONSE_TOO_LARGE", "NDVI COG exceeds 2 GiB."
                            )
                        stream.write(chunk)
                os.replace(partial, target)
        finally:
            partial.unlink(missing_ok=True)

    async def original_status(
        self, mode: str, remote_id: str, subject: str | None, base_url: str | None
    ) -> int:
        token = self.token(mode, subject, base_url)
        headers = (
            {}
            if token is None
            else {"Authorization": "Bearer " + token.get_secret_value()}
        )
        async with (
            self.client(mode) as http,
            http.stream(
                "GET",
                BASE_URL + f"/computation-api/process/result/download/{remote_id}",
                headers=headers,
                follow_redirects=False,
                timeout=25,
            ) as response,
        ):
            return response.status_code
