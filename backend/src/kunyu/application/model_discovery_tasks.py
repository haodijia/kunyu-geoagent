import asyncio
import logging

from kunyu.application.model_catalog import (
    DiscoverySupersededError,
    ModelCatalogService,
)
from kunyu.application.model_connections import ModelConnectionNotFoundError
from kunyu.domain.model_connections import (
    DiscoveryStatus,
    ModelConnection,
)
from kunyu.integrations.model.provider_client import ProviderRequestError

logger = logging.getLogger(__name__)


class ModelDiscoveryTasks:
    def __init__(self, service: ModelCatalogService) -> None:
        self.service = service
        self._tasks: dict[tuple[str, int, int], asyncio.Task[None]] = {}

    def start(self) -> None:
        self.service.interrupt_pending()

    async def stop(self) -> None:
        tasks = tuple(self._tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self.service.interrupt_pending()

    def schedule_if_pending(self, connection: ModelConnection) -> None:
        if connection.discovery.status is not DiscoveryStatus.PENDING:
            return
        key = (
            connection.id,
            connection.revision,
            connection.discovery.generation,
        )
        existing = self._tasks.get(key)
        if existing is not None and not existing.done():
            return
        task = asyncio.create_task(self._run(key))
        self._tasks[key] = task
        task.add_done_callback(lambda _: self._tasks.pop(key, None))

    async def _run(self, key: tuple[str, int, int]) -> None:
        connection_id, revision, generation = key
        try:
            await self.service.run_pending_discovery(
                connection_id,
                revision,
                generation,
            )
        except (DiscoverySupersededError, ModelConnectionNotFoundError):
            return
        except ProviderRequestError as error:
            logger.info(
                "Model discovery failed connection_id=%s error_code=%s",
                connection_id,
                error.code.value,
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "Model discovery failed unexpectedly connection_id=%s",
                connection_id,
            )
