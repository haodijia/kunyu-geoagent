"""Resume the recorded COG read; never submit an analysis job."""

import argparse
import json
import os
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx
from kunyu.integrations.oge.recording import OgeHttpRecorder, write_json
from kunyu.persistence.oge import OgeAccountStore


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--account-data-dir", type=Path, required=True)
    parser.add_argument("--case-dir", type=Path, required=True)
    args = parser.parse_args()
    account = OgeAccountStore(args.account_data_dir).read()
    if account is None or account.tokens.exp <= time.time():
        raise RuntimeError("A valid OGE login is required.")
    token = account.tokens.token.get_secret_value()
    auth = {"Authorization": account.tokens.tokenHead + token}
    secrets = (token, account.tokens.refreshToken.get_secret_value())
    manifest_path = args.case_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    if manifest["state"] == "complete":
        raise RuntimeError(
            "The capture is complete; no further live asset reads are needed."
        )
    job = manifest["job_id"]
    asset_directory = args.account_data_dir / "oge/recordings/ndvi-default"
    asset_directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    partial = asset_directory / "ndvi-result.partial.tif"
    if not partial.exists():
        os.replace(args.case_dir / "preview-response.tif", partial)
    offset = partial.stat().st_size
    url = f"https://openge.org.cn/api/computation-api/styles/cog/{job}"
    with httpx.Client(
        timeout=httpx.Timeout(3600, connect=15),
        transport=httpx.HTTPTransport(retries=0),
    ) as client:
        head = client.head(url, headers=auth)
        head.raise_for_status()
        total = int(head.headers["content-length"])
        if total > 2 * 1024 * 1024 * 1024:
            raise RuntimeError("COG exceeds the 2 GiB recording limit.")
        exchange = {
            "name": "preview-range",
            "started_at": datetime.now(UTC).isoformat(),
            "request": {
                "method": "GET",
                "url": url,
                "body": None,
                "headers": {"Authorization": "<redacted>", "Range": f"bytes={offset}-"},
            },
            "response": None,
        }
        manifest["exchanges"].append(exchange)
        manifest["state"] = "downloading_cog"
        manifest["cog_source"] = {
            "url": url,
            "expected_bytes": total,
            "initial_recorded_bytes": offset,
            "head_status": head.status_code,
            "head_headers": {
                key: head.headers[key]
                for key in ("content-type", "content-length", "accept-ranges")
            },
        }
        write_json(manifest_path, manifest)
        start = time.monotonic()
        with client.stream(
            "GET", url, headers={**auth, "Range": f"bytes={offset}-"}
        ) as response:
            if (
                response.status_code != 206
                or response.headers["content-range"]
                != f"bytes {offset}-{total - 1}/{total}"
            ):
                raise RuntimeError(
                    "Server did not return the exact requested byte range."
                )
            received = 0
            reported = 0
            with partial.open("ab") as output:
                for chunk in response.iter_bytes():
                    received += len(chunk)
                    if offset + received > total:
                        raise RuntimeError("COG transfer exceeded the advertised size.")
                    output.write(chunk)
                    if received - reported >= 64 * 1024 * 1024:
                        reported = received
                        print(
                            json.dumps(
                                {
                                    "downloaded_bytes": offset + received,
                                    "total_bytes": total,
                                }
                            ),
                            flush=True,
                        )
                output.flush()
                os.fsync(output.fileno())
            if partial.stat().st_size != total:
                raise RuntimeError("COG transfer ended before the advertised size.")
            final = asset_directory / "ndvi-result.tif"
            os.replace(partial, final)
            exchange["response"] = {
                "status": 206,
                "headers": {
                    "content-type": response.headers["content-type"],
                    "content-range": response.headers["content-range"],
                },
                "body_file": "ndvi-result.tif",
                "storage": "asset",
                "body_offset": offset,
                "bytes": received,
                "complete": True,
            }
        exchange["finished_at"] = datetime.now(UTC).isoformat()
        exchange["elapsed_ms"] = round((time.monotonic() - start) * 1000)
        manifest["cog_source"]["local_file"] = "ndvi-result.tif"
        manifest["state"] = "cog_downloaded"
        write_json(manifest_path, manifest)
        recorder = OgeHttpRecorder(args.case_dir, client, secrets=secrets)
        response = recorder.request(
            "download",
            "GET",
            f"https://openge.org.cn/api/computation-api/process/result/download/{job}",
            headers=auth,
            max_bytes=2 * 1024 * 1024 * 1024,
        )
        recorder.manifest["outputs"]["preview"] = {
            "http_status": 200,
            "content_type": "image/tiff",
            "available": True,
            "source_file": "ndvi-result.tif",
            "storage": "asset",
        }
        recorder.manifest["outputs"]["download"] = {
            "http_status": response.status_code,
            "content_type": response.headers.get("content-type"),
            "available": response.is_success,
        }
        recorder.manifest["state"] = "complete"
        recorder.persist()
        print(
            json.dumps(
                {
                    "state": "complete",
                    "original_file": str(final),
                    "bytes": total,
                    "download_endpoint_status": response.status_code,
                }
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
