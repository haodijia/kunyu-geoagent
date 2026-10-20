"""Read operator definitions in one batch, retaining individual failures."""

import asyncio
import logging

import httpx

from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.oge import OgeError
from kunyu.integrations.oge.execution import ExecutionGateway

logger = logging.getLogger(__name__)


async def read_definitions(
    gateway: ExecutionGateway, names: list[str], subject: str, base: str
) -> list[dict]:
    semaphore = asyncio.Semaphore(4)

    async def read(name: str) -> dict:
        async with semaphore:
            try:
                return await _read_definition(gateway, name, subject, base)
            except (OgeError, AnalysisError) as error:
                code, message = error.code, str(error)
            except httpx.HTTPError as error:
                code = (
                    "OGE_TIMEOUT"
                    if isinstance(error, httpx.TimeoutException)
                    else "OGE_HTTP_ERROR"
                )
                message = f"{type(error).__name__}: {error}"
            logger.warning(
                "Reading OGE operator %s failed (%s): %s", name, code, message
            )
            return {"name": name, "error": {"code": code, "message": message}}

    return list(await asyncio.gather(*(read(name) for name in names)))


async def _read_definition(
    gateway: ExecutionGateway, name: str, subject: str, base: str
) -> dict:
    value = await gateway.request(
        "GET",
        "/computation-api/process/info",
        subject,
        base,
        params={"processName": name},
    )
    if (
        not isinstance(value, dict)
        or value.get("name") != name
        or not isinstance(value.get("args"), list)
    ):
        raise AnalysisError(
            "OGE_OPERATOR_NOT_FOUND", "No matching operator definition returned."
        )
    definition = {
        key: value[key]
        for key in (
            "name",
            "alias",
            "description",
            "descriptionEn",
            "type",
            "args",
            "output",
        )
        if key in value
    }
    # Keep complete parameter schemas; bound only optional sample scripts.
    sample = value.get("sampleCode")
    if isinstance(sample, str):
        definition["sampleCode"] = sample[:4000]
        definition["sample_code_truncated"] = len(sample) > 4000
    return definition
