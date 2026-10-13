"""Explicit HTTP recording and offline replay; replay never contacts OGE."""

import json
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx

SECRET_KEYS = {
    "authorization",
    "cookie",
    "setcookie",
    "token",
    "refreshtoken",
    "accesstoken",
    "password",
    "clientsecret",
    "signature",
    "tk",
}
RESPONSE_HEADERS = {
    "content-type",
    "content-disposition",
    "date",
    "server",
    "x-request-id",
    "request-id",
}


def _key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def _sanitize(value: object, secrets: tuple[str, ...]) -> object:
    if isinstance(value, dict):
        return {
            key: "<redacted>" if _key(key) in SECRET_KEYS else _sanitize(item, secrets)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_sanitize(item, secrets) for item in value]
    if isinstance(value, str):
        for secret in secrets:
            if secret:
                value = value.replace(secret, "<redacted>")
        if value.startswith(("http://", "https://")):
            url = urlsplit(value)
            query = [
                (key, "<redacted>" if _key(key) in SECRET_KEYS else item)
                for key, item in parse_qsl(url.query, keep_blank_values=True)
            ]
            value = urlunsplit(
                (url.scheme, url.netloc, url.path, urlencode(query), url.fragment)
            )
    return value


def write_json(path: Path, value: object) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


class OgeHttpRecorder:
    def __init__(
        self, directory: Path, client: httpx.Client, *, secrets: tuple[str, ...]
    ) -> None:
        self.directory, self.client, self.secrets = directory, client, secrets
        self.directory.mkdir(parents=True, exist_ok=True)
        self._manifest_path = directory / "manifest.json"
        self.manifest = (
            json.loads(self._manifest_path.read_text())
            if self._manifest_path.exists()
            else {
                "version": 2,
                "service": "NDVI",
                "input_mode": "service_defaults",
                "submit_attempts": 0,
                "state": "prepared",
                "exchanges": [],
                "mock_resources": [],
            }
        )

    def persist(self) -> None:
        write_json(self._manifest_path, self.manifest)

    def request(
        self,
        name: str,
        method: str,
        url: str,
        *,
        body: dict | None = None,
        headers: dict[str, str],
        max_bytes: int,
    ) -> httpx.Response:
        if not re.fullmatch(r"[a-z0-9-]+", name):
            raise ValueError(
                "Exchange name must contain lowercase letters, numbers and hyphens."
            )
        if any(exchange["name"] == name for exchange in self.manifest["exchanges"]):
            raise RuntimeError(f"Exchange {name} is already recorded.")
        if method == "POST":
            with (self.directory / "submission-started.json").open(
                "x", encoding="utf-8"
            ) as stream:
                json.dump(
                    {"started_at": datetime.now(UTC).isoformat(), "url": url}, stream
                )
            self.manifest["submit_attempts"] += 1
            self.manifest["state"] = "submitting"
        exchange = {
            "name": name,
            "started_at": datetime.now(UTC).isoformat(),
            "request": {
                "method": method,
                "url": _sanitize(url, self.secrets),
                "body": _sanitize(body, self.secrets),
                "headers": _sanitize(headers, self.secrets),
            },
            "response": None,
        }
        self.manifest["exchanges"].append(exchange)
        self.persist()
        start = time.monotonic()
        try:
            with self.client.stream(
                method, url, json=body, headers=headers, follow_redirects=False
            ) as response:
                media_type = (
                    response.headers.get("content-type", "")
                    .split(";", 1)[0]
                    .strip()
                    .lower()
                )
                extension = (
                    ".json"
                    if media_type in {"application/json", "application/problem+json"}
                    else ".body"
                )
                if media_type == "image/png":
                    extension = ".png"
                if media_type in {"image/tiff", "image/geotiff"}:
                    extension = ".tif"
                body_name = f"{name}-response{extension}"
                target = self.directory / body_name
                size = 0
                if extension == ".json":
                    data = bytearray()
                    for chunk in response.iter_bytes():
                        if len(data) + len(chunk) > max_bytes:
                            raise RuntimeError(
                                "JSON response exceeded the recording byte limit."
                            )
                        data.extend(chunk)
                    if data:
                        write_json(target, _sanitize(json.loads(data), self.secrets))
                    else:
                        target.write_bytes(b"")
                else:
                    with target.open("xb") as stream:
                        for chunk in response.iter_bytes():
                            size += len(chunk)
                            if size > max_bytes:
                                raise RuntimeError(
                                    "Response exceeded the recording byte limit."
                                )
                            stream.write(chunk)
                    if media_type.startswith("text/"):
                        raw = target.read_bytes()
                        for secret in self.secrets:
                            if secret:
                                raw = raw.replace(secret.encode(), b"<redacted>")
                        target.write_bytes(raw)
                exchange["response"] = {
                    "status": response.status_code,
                    "headers": {
                        key: value
                        for key, value in response.headers.items()
                        if key.lower() in RESPONSE_HEADERS
                    },
                    "body_file": body_name,
                    "storage": "case",
                    "body_offset": 0,
                    "complete": True,
                    "bytes": target.stat().st_size,
                }
                # The returned response is for local inspection, never persisted unsanitized.
                content = target.read_bytes() if extension == ".json" else b""
                return httpx.Response(
                    response.status_code,
                    headers={"content-type": media_type},
                    content=content,
                    request=response.request,
                )
        except Exception as error:
            exchange["error"] = {"type": type(error).__name__}
            self.manifest["state"] = "capture_interrupted"
            raise
        finally:
            exchange["finished_at"] = datetime.now(UTC).isoformat()
            exchange["elapsed_ms"] = round((time.monotonic() - start) * 1000)
            self.persist()


class OgeReplayTransport(httpx.AsyncBaseTransport):
    def __init__(
        self,
        directory: Path,
        *,
        assets_directory: Path | None = None,
        terminal_status: bool = True,
    ) -> None:
        self._directory = directory.resolve()
        manifest = json.loads((directory / "manifest.json").read_text())
        if manifest["version"] != 2:
            raise ValueError("The recording must use schema version 2.")
        if manifest["state"] != "complete":
            raise ValueError("Only a complete, verified recording can be replayed.")
        self._assets_directory = (
            assets_directory.resolve() if assets_directory is not None else None
        )
        self._exchanges = [
            item
            for item in manifest["exchanges"]
            if item["response"] is not None and item["response"]["complete"]
        ]
        self._exchanges.extend(manifest["mock_resources"])
        self._cursors: dict[tuple, int] = {}
        self._terminal_status = terminal_status

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        key = (
            request.method,
            request.url.path,
            tuple(sorted(request.url.params.multi_items())),
            request.headers.get("range"),
        )
        candidates = []
        for exchange in self._exchanges:
            recorded = exchange["request"]
            url = httpx.URL(recorded["url"])
            if (
                key
                == (
                    recorded["method"],
                    url.path,
                    tuple(sorted(url.params.multi_items())),
                    recorded["headers"].get("Range"),
                )
                and body == recorded["body"]
            ):
                candidates.append(exchange)
        if not candidates:
            raise RuntimeError(
                f"No recorded response for {request.method} {request.url.path}."
            )
        cursor = self._cursors.get(key, 0)
        if request.method == "POST" and cursor > 0:
            raise RuntimeError(
                "A replay session permits only one simulated submission."
            )
        self._cursors[key] = cursor + 1
        if self._terminal_status and all(
            item["name"].startswith("status-") for item in candidates
        ):
            exchange = candidates[-1]
        else:
            exchange = candidates[min(cursor, len(candidates) - 1)]
        response = exchange["response"]
        if response is None:
            raise RuntimeError("The recorded exchange has no response.")
        if response["storage"] == "case":
            root = self._directory
        elif response["storage"] == "asset" and self._assets_directory is not None:
            root = self._assets_directory
        else:
            raise ValueError(
                "This recorded response requires its explicitly configured asset directory."
            )
        path = (root / response["body_file"]).resolve()
        if path.parent != root:
            raise ValueError("Recording response must stay inside its case directory.")
        return httpx.Response(
            response["status"],
            headers=response["headers"],
            stream=_RecordedFileStream(
                path, offset=response["body_offset"], length=response["bytes"]
            ),
            request=request,
        )


class _RecordedFileStream(httpx.AsyncByteStream):
    def __init__(self, path: Path, *, offset: int, length: int) -> None:
        self._path, self._offset, self._length = path, offset, length

    async def __aiter__(self):
        with self._path.open("rb") as source:
            source.seek(self._offset)
            remaining = self._length
            while remaining > 0:
                chunk = source.read(min(remaining, 64 * 1024))
                if not chunk:
                    raise RuntimeError(
                        "The recorded asset is shorter than its declared byte range."
                    )
                remaining -= len(chunk)
                yield chunk
