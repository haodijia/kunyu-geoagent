"""Bounded, durable read supervision independent of the Agent run lifetime."""

import asyncio
import logging
import time

import httpx

from kunyu.application.analysis.analysis import AnalysisService
from kunyu.domain.geospatial.analysis import AnalysisError
from kunyu.domain.geospatial.oge import OgeError

logger = logging.getLogger(__name__)


class AnalysisSupervisor:
    def __init__(self, service: AnalysisService) -> None:
        self.service = service
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        self.service.repository.recover()
        self._task = asyncio.create_task(self._loop(), name="analysis-supervisor")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _loop(self) -> None:
        while True:
            for job, subject, base in self.service.repository.due():
                try:
                    await self.service.advance(job, subject, base)
                except OgeError as error:
                    logger.warning(
                        "Analysis job %s could not advance (%s).", job.id, error.code
                    )
                    auth = (
                        error.code.startswith("OGE_AUTH")
                        or error.code == "OGE_ACCOUNT_CHANGED"
                    )
                    self.service.repository.change(
                        job.id,
                        query_state="auth_required" if auth else "disconnected",
                        error_code=error.code,
                        error_message=str(error),
                        next_poll_at=time.time() + 30,
                    )
                except AnalysisError as error:
                    logger.warning("Analysis job %s failed (%s).", job.id, error.code)
                    self.service.repository.change(
                        job.id,
                        state="failed",
                        error_code=error.code,
                        error_message=str(error),
                    )
                except httpx.HTTPError as error:
                    logger.warning(
                        "Analysis job %s lost its network connection.", job.id
                    )
                    self.service.repository.change(
                        job.id,
                        query_state="disconnected",
                        error_code="OGE_NETWORK",
                        error_message=f"{type(error).__name__}: {error}",
                        next_poll_at=time.time() + 30,
                    )
                except Exception as error:
                    logger.exception(
                        "Analysis result preparation failed for job %s.", job.id
                    )
                    self.service.repository.change(
                        job.id,
                        state="failed",
                        error_code="RESULT_PREPARATION_FAILED",
                        error_message=str(error),
                    )
                await self.service.notify()
            await asyncio.sleep(0.5)
