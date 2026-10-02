from collections.abc import Callable
from datetime import UTC, datetime
from uuid import uuid4

from kunyu.application.connection_locks import ConnectionOperationLocks
from kunyu.domain.run_acceptance import RunAcceptanceRequest, RunAcceptanceResult
from kunyu.persistence.model_connections import SQLAlchemyModelConnectionRepository
from kunyu.persistence.run_acceptance import SQLAlchemyRunAcceptanceRepository


class RunAcceptanceService:
    def __init__(
        self,
        repository: SQLAlchemyRunAcceptanceRepository,
        connections: SQLAlchemyModelConnectionRepository,
        locks: ConnectionOperationLocks,
        *,
        message_id_factory: Callable[[], str] | None = None,
        run_id_factory: Callable[[], str] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._connections = connections
        self._locks = locks
        self._message_id_factory = message_id_factory or _new_message_id
        self._run_id_factory = run_id_factory or _new_run_id
        self._clock = clock or _utc_now

    def find_idempotent(
        self, request: RunAcceptanceRequest
    ) -> RunAcceptanceResult | None:
        return self._repository.find_idempotent(
            request.session_id,
            request.idempotency_key,
            request.normalized_body,
        )

    def accept(
        self,
        request: RunAcceptanceRequest,
        queue_sequence: int,
    ) -> RunAcceptanceResult:
        connection_id = request.model_selection.connection_id
        with self._locks.hold(connection_id):
            api_key = self._connections.get_api_key(connection_id)
            return self._repository.accept(
                request,
                queue_sequence=queue_sequence,
                credential_available=api_key is not None,
                message_id=self._message_id_factory(),
                run_id=self._run_id_factory(),
                occurred_at=self._clock(),
            )

    def steer(self, request: RunAcceptanceRequest, run_id: str) -> RunAcceptanceResult:
        return self._repository.steer(
            request,
            run_id=run_id,
            message_id=self._message_id_factory(),
            occurred_at=self._clock(),
        )

    def claim_next_turn(self, session_id: str) -> RunAcceptanceResult | None:
        return self._repository.claim_next_turn(session_id, self._clock())


def _new_message_id() -> str:
    return f"msg_{uuid4().hex}"


def _new_run_id() -> str:
    return f"run_{uuid4().hex}"


def _utc_now() -> datetime:
    return datetime.now(UTC)
