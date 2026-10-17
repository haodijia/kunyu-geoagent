"""Record one default NDVI submission, then collect the same job's outputs."""

import argparse
import json
import time
from pathlib import Path

import httpx
from kunyu.integrations.oge.recording import OgeHttpRecorder
from kunyu.persistence.geospatial.oge import OgeAccountStore


def credentials(directory: Path) -> tuple[dict[str, str], tuple[str, ...]]:
    account = OgeAccountStore(directory).read()
    if account is None or account.tokens.exp <= time.time():
        raise RuntimeError(
            "A valid OGE login is required; log in through settings first."
        )
    token = account.tokens.token.get_secret_value()
    return {"Authorization": account.tokens.tokenHead + token}, (
        token,
        account.tokens.refreshToken.get_secret_value(),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("submit", "collect"))
    parser.add_argument("--account-data-dir", type=Path, required=True)
    parser.add_argument("--case-dir", type=Path, required=True)
    parser.add_argument("--service-url")
    parser.add_argument("--result-base-url")
    parser.add_argument("--job-id")
    args = parser.parse_args()
    manifest_path = args.case_dir / "manifest.json"
    if (
        manifest_path.exists()
        and json.loads(manifest_path.read_text())["state"] == "complete"
    ):
        raise RuntimeError(
            "The capture is complete; use offline replay instead of making more live requests."
        )
    headers, secrets = credentials(args.account_data_dir)
    with httpx.Client(
        timeout=httpx.Timeout(3600, connect=15),
        transport=httpx.HTTPTransport(retries=0),
        follow_redirects=False,
    ) as client:
        recorder = OgeHttpRecorder(args.case_dir, client, secrets=secrets)
        if args.action == "submit":
            if args.service_url is None:
                parser.error("submit requires --service-url")
            response = recorder.request(
                "submit",
                "POST",
                args.service_url,
                body={},
                headers=headers,
                max_bytes=16 * 1024 * 1024,
            )
            recorder.manifest["state"] = (
                "submitted" if response.is_success else "submission_rejected"
            )
            recorder.persist()
            body = (
                response.json()
                if response.headers.get("content-type") == "application/json"
                else None
            )
            print(
                json.dumps(
                    {"http_status": response.status_code, "response": body},
                    ensure_ascii=False,
                ),
                flush=True,
            )
            return
        if args.result_base_url is None or args.job_id is None:
            parser.error("collect requires --result-base-url and --job-id")
        if recorder.manifest["submit_attempts"] != 1:
            raise RuntimeError("The case must contain exactly one submission attempt.")
        if args.job_id not in (args.case_dir / "submit-response.json").read_text():
            raise RuntimeError(
                "The job identity is absent from the recorded submission response."
            )
        recorder.manifest["job_id"] = args.job_id
        recorder.manifest["state"] = "collecting"
        recorder.persist()
        number = sum(
            item["name"].startswith("result-status-")
            for item in recorder.manifest["exchanges"]
        )
        while True:
            headers, _ = credentials(args.account_data_dir)
            number += 1
            response = recorder.request(
                f"result-status-{number:04d}",
                "GET",
                f"{args.result_base_url}/process/result/{args.job_id}",
                headers=headers,
                max_bytes=16 * 1024 * 1024,
            )
            response.raise_for_status()
            body = response.json()
            if body["code"] != 20000 or body["data"]["jobId"] != args.job_id:
                raise RuntimeError(
                    "OGE returned an error or a different result identity."
                )
            status = body["data"]["status"]
            print(
                json.dumps(
                    {"job_id": args.job_id, "engine_status": status, "poll": number}
                ),
                flush=True,
            )
            if status == "fail":
                recorder.manifest["state"] = "remote_failed"
                recorder.persist()
                return
            if status == "success":
                break
            if status != "running":
                raise RuntimeError(f"Undocumented GP engine status: {status}")
            time.sleep(10)
        recorder.manifest["outputs"] = {}
        for name, suffix, limit in (
            ("result", f"/process/result/{args.job_id}", 16 * 1024 * 1024),
            ("preview", f"/styles/cog/{args.job_id}", 64 * 1024 * 1024),
            (
                "download",
                f"/process/result/download/{args.job_id}",
                2 * 1024 * 1024 * 1024,
            ),
        ):
            headers, _ = credentials(args.account_data_dir)
            response = recorder.request(
                name,
                "GET",
                args.result_base_url + suffix,
                headers=headers,
                max_bytes=limit,
            )
            media_type = response.headers.get("content-type")
            available = response.is_success
            if media_type == "application/json":
                body = response.json()
                available = available and body.get("code") == 20000 and name == "result"
            recorder.manifest["outputs"][name] = {
                "http_status": response.status_code,
                "content_type": media_type,
                "available": available,
            }
            recorder.persist()
        recorder.manifest["state"] = "complete"
        recorder.persist()
        print(
            json.dumps(
                {
                    "state": "complete",
                    "case_dir": str(args.case_dir),
                    "exchanges": len(recorder.manifest["exchanges"]),
                }
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
