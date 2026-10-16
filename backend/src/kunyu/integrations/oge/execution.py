"""Verified JWT code compilation, batch execution and raster retrieval."""

import asyncio
import base64
import json
import os
import time
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

import httpx

from kunyu.domain.analysis import AnalysisError
from kunyu.domain.oge import OgeAccount, OgeError
from kunyu.persistence.oge import OgeAccountStore

BASE_URL = "https://openge.org.cn/api"


class ExecutionGateway:
    def __init__(self, http: httpx.AsyncClient, accounts: OgeAccountStore) -> None:
        self.http, self.accounts = http, accounts
        # OGE compilation stores DAGs in the user's remote interpreter session.
        self.submissions = asyncio.Lock()

    def account(
        self, subject: str | None = None, base: str | None = None
    ) -> OgeAccount:
        account = self.accounts.read()
        if account is None:
            raise OgeError("OGE_AUTH_REQUIRED", "Log in to OGE in settings.", 401)
        if account.tokens.exp <= time.time():
            raise OgeError("OGE_AUTH_EXPIRED", "OGE login expired; log in again.", 401)
        url = urlsplit(account.base_url)
        if url.hostname != "openge.org.cn" or url.path.rstrip("/") != "/api":
            raise OgeError(
                "OGE_ACCOUNT_ENDPOINT", "OGE execution requires openge.org.cn/api.", 409
            )
        if subject is not None and (account.username, account.base_url) != (
            subject,
            base,
        ):
            raise OgeError(
                "OGE_ACCOUNT_CHANGED",
                "Restore the account that submitted this job.",
                409,
            )
        return account

    def subject(self) -> tuple[str, str]:
        account = self.account()
        return account.username, account.base_url

    def binding(self) -> str:
        account = self.accounts.read()
        return "oge:execute-code:v1:" + (
            "unconfigured" if account is None else account.username
        )

    @staticmethod
    def user_id(account: OgeAccount) -> str:
        # The server authenticates the JWT; this claim only binds request ownership.
        try:
            payload = account.tokens.token.get_secret_value().split(".")[1]
            claims = json.loads(
                base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
            )
            return str(UUID(claims["uuid"]))
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise OgeError(
                "OGE_ACCOUNT_IDENTITY", "The OGE login has no valid user UUID.", 401
            ) from error

    async def request(
        self, method: str, path: str, subject: str, base: str, *, body=None, params=None
    ):
        account = self.account(subject, base)
        async with self.http.stream(
            method,
            BASE_URL + path,
            json=body,
            params=params,
            headers={
                "Authorization": "Bearer " + account.tokens.token.get_secret_value()
            },
            timeout=httpx.Timeout(90, connect=15),
            follow_redirects=False,
        ) as response:
            if response.status_code in {401, 403}:
                raise OgeError(
                    "OGE_AUTH_REQUIRED",
                    "Restore the OGE account login.",
                    response.status_code,
                )
            response.raise_for_status()
            raw = bytearray()
            async for chunk in response.aiter_bytes():
                raw.extend(chunk)
                if len(raw) > 8 * 1024 * 1024:
                    raise OgeError(
                        "OGE_RESPONSE_TOO_LARGE", "OGE metadata exceeds 8 MiB."
                    )
        if path == "/computation-api/getState":
            return raw.decode("utf-8").strip()
        try:
            value = json.loads(raw)
        except ValueError as error:
            raise OgeError(
                "OGE_PROTOCOL_ERROR", "OGE returned invalid JSON."
            ) from error
        if isinstance(value, dict) and "code" in value:
            if value["code"] not in {200, 20000}:
                raise AnalysisError(
                    "OGE_REMOTE_ERROR",
                    str(value.get("msg", "OGE request failed."))[:2000],
                )
            return value.get("data")
        return value

    async def compile(self, code: str, name: str, subject: str, base: str) -> dict:
        value = await self.request(
            "POST",
            "/computation-api/executeCode",
            subject,
            base,
            body={
                "code": code,
                "userId": self.user_id(self.account(subject, base)),
                "sampleName": name,
            },
        )
        if not isinstance(value, dict) or not isinstance(value.get("dags"), dict):
            raise AnalysisError(
                "OGE_COMPILE_FAILED",
                str(value.get("log", "No DAG returned."))[:2000]
                if isinstance(value, dict)
                else "No DAG returned.",
            )
        log = str(value.get("log", ""))
        if "Traceback (most recent call last)" in log:
            raise AnalysisError("OGE_COMPILE_FAILED", log[-2000:])
        dags = value["dags"]
        if len(dags) != 1:
            raise AnalysisError(
                "OGE_EXPORT_COUNT",
                "Code must export exactly one raster; compose operators before calling result.export(name).",
            )
        dag_id, dag = next(iter(dags.items()))
        try:
            UUID(dag_id)
        except (ValueError, TypeError) as error:
            raise AnalysisError(
                "OGE_PROTOCOL_ERROR", "Invalid compiled DAG identity."
            ) from error
        if (
            not isinstance(dag, dict)
            or dag.get("isBatch") is not True
            or "exportCoverage" not in dag
        ):
            raise AnalysisError(
                "OGE_UNSUPPORTED_EXPORT", "Only batch Coverage exports are supported."
            )
        return {"dag_id": dag_id, "log": str(value.get("log", ""))[:4000]}

    async def submit(self, parameters: dict, subject: str, base: str) -> str:
        value = await self.request(
            "POST",
            "/computation-api/addTaskRecord",
            subject,
            base,
            body={
                "taskName": parameters["title"],
                "crs": parameters["crs"],
                "scale": str(parameters["scale"]),
                "filename": parameters["filename"],
                "format": "tif",
                "id": parameters["dag_id"],
                "userName": subject,
                "script": parameters["script"],
                "source": 0,
            },
        )
        if (
            not isinstance(value, dict)
            or value.get("dagId") != parameters["dag_id"]
            or not isinstance(value.get("jobId"), str)
            or not value["jobId"].startswith("job-")
        ):
            raise OgeError(
                "OGE_PROTOCOL_ERROR", "The batch response has no matching job identity."
            )
        return value["jobId"]

    async def state(self, dag_id: str, subject: str, base: str) -> str:
        value = await self.request(
            "GET", "/computation-api/getState", subject, base, params={"dagId": dag_id}
        )
        if value in ("running", "success"):
            return value
        if value in ("dead", "cancel", "failed", "FAILED"):
            raise AnalysisError("OGE_COMPUTATION_FAILED", f"OGE batch state: {value}.")
        raise AnalysisError(
            "OGE_UNKNOWN_STATE", f"Unsupported OGE batch state: {str(value)[:200]}."
        )

    async def result(self, job_id: str, subject: str, base: str) -> dict | None:
        try:
            value = await self.request(
                "GET", f"/computation-api/process/result/{job_id}", subject, base
            )
        except AnalysisError as error:
            if error.code == "OGE_REMOTE_ERROR" and str(error).startswith(
                "result not ready"
            ):
                if "state=FAILED" in str(error):
                    raise AnalysisError("OGE_COMPUTATION_FAILED", str(error)) from error
                return None
            raise
        if (
            not isinstance(value, dict)
            or value.get("jobId") != job_id
            or value.get("status") != "success"
        ):
            raise AnalysisError(
                "OGE_RESULT_INVALID",
                "OGE did not return a successful result for this job.",
            )
        return value

    async def download(
        self, parameters: dict, subject: str, base: str, target: Path
    ) -> bool:
        catalog = await self.request(
            "GET", "/asset/batch-result/catalog", subject, base
        )
        if not isinstance(catalog, list):
            raise AnalysisError(
                "OGE_PROTOCOL_ERROR", "Invalid OGE batch result catalog."
            )
        user_id = self.user_id(self.account(subject, base))
        matches = [
            item
            for item in catalog
            if isinstance(item, dict)
            and item.get("dagId") == parameters["dag_id"]
            and item.get("filename") == parameters["filename"]
        ]
        if not matches:
            return False  # Computation completion can precede publication.
        if (
            len(matches) != 1
            or matches[0].get("userId") != user_id
            or not matches[0].get("id")
        ):
            raise AnalysisError(
                "OGE_RESULT_IDENTITY",
                "OGE result ownership or identity does not match.",
            )
        account = self.account(subject, base)
        partial = target.with_suffix(".partial.tif")
        try:
            async with self.http.stream(
                "GET",
                BASE_URL + "/asset/batch-result/downloadBatchResult",
                params={"id": matches[0]["id"], "userUuid": user_id},
                headers={
                    "Authorization": "Bearer " + account.tokens.token.get_secret_value()
                },
                timeout=httpx.Timeout(180, connect=15),
                follow_redirects=False,
            ) as response:
                if response.status_code in {401, 403}:
                    raise OgeError(
                        "OGE_AUTH_REQUIRED",
                        "Restore the OGE account login.",
                        response.status_code,
                    )
                response.raise_for_status()
                size = 0
                prefix = bytearray()
                with partial.open("wb") as stream:
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > 2 * 1024**3:
                            raise AnalysisError(
                                "OGE_RESPONSE_TOO_LARGE", "Raster exceeds 2 GiB."
                            )
                        if len(prefix) < 4:
                            prefix.extend(chunk[: 4 - len(prefix)])
                        stream.write(chunk)
                if bytes(prefix) not in (
                    b"II*\x00",
                    b"MM\x00*",
                    b"II+\x00",
                    b"MM\x00+",
                ):
                    raise AnalysisError(
                        "OGE_INVALID_RASTER", "The batch download is not a TIFF."
                    )
                os.replace(partial, target)
        finally:
            partial.unlink(missing_ok=True)
        return True
