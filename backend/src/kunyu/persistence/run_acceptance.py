from datetime import datetime
from typing import cast

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from kunyu.agent.runtime.events import (
    BudgetLimitsPayload,
    EventBatch,
    InboxMessagePayload,
    InboxSplicedEvent,
    InboxSplicedPayload,
    ModelSnapshotPayload,
    QueueDispatchedEvent,
    QueueDispatchedPayload,
    QueuedTurnPayload,
    QueueReorderedEvent,
    QueueReorderedPayload,
)
from kunyu.agent.runtime.session_reducer import reduce_session
from kunyu.agent.runtime.session_state import ReducedSession
from kunyu.domain.messages import Message, MessageRole, MessageStatus
from kunyu.domain.model_connections import ModelAuthMode, ModelProtocol
from kunyu.domain.run_acceptance import (
    CredentialUnavailableError,
    IdempotencyConflictError,
    InvalidMapContextError,
    ModelUnverifiedError,
    RunAcceptanceConflictError,
    RunAcceptanceNotFoundError,
    RunAcceptanceRequest,
    RunAcceptanceResult,
    SessionArchivedAcceptanceError,
    UnsupportedModelCapabilityError,
    WorkspaceRemovedAcceptanceError,
)
from kunyu.domain.runs import NONTERMINAL_RUN_STATE_VALUES, RunDetails
from kunyu.persistence import run_records
from kunyu.persistence.agent_projections import SQLAlchemyAgentProjectionService
from kunyu.persistence.attachments import REFERENCE, resolve_references
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    MessageIdempotencyRecord,
    MessageRecord,
    ModelCatalogEntryRecord,
    ModelConnectionRecord,
    RunModelSnapshotRecord,
    RunRecord,
    SessionArchiveRecord,
    SessionEventRecord,
    SessionPreferenceRecord,
    SessionRecord,
    ToolCallRecord,
    WorkspaceRecord,
    WorkspaceRemovalRecord,
)
from kunyu.persistence.run_admission import turn_events
from kunyu.persistence.time import as_utc

MAX_MODEL_CALLS = 8
MAX_TOOL_CALLS = 16
MAX_ACTIVE_MILLISECONDS = 300_000
MAX_OUTPUT_CODEPOINTS = 32_768
MAX_MODEL_OUTPUT_TOKENS = 4_096


class SQLAlchemyRunAcceptanceRepository:
    def __init__(self, database: Database) -> None:
        self._database = database
        self._projections = SQLAlchemyAgentProjectionService(database)

    def find_idempotent(
        self,
        session_id: str,
        idempotency_key: str,
        normalized_body: str,
    ) -> RunAcceptanceResult | None:
        with self._database.sessions() as database_session:
            if database_session.get(SessionRecord, session_id) is None:
                raise RunAcceptanceNotFoundError(
                    f"Session '{session_id}' was not found."
                )
            record = database_session.scalar(
                select(MessageIdempotencyRecord).where(
                    MessageIdempotencyRecord.session_id == session_id,
                    MessageIdempotencyRecord.idempotency_key == idempotency_key,
                )
            )
            if record is None:
                return None
            if record.normalized_body != normalized_body:
                raise IdempotencyConflictError(
                    "The idempotency key was already used with a different request."
                )
            message_id = record.message_id
            run_id = record.run_id
        return self._load_result(message_id, run_id)

    def accept(
        self,
        request: RunAcceptanceRequest,
        *,
        queue_sequence: int,
        credential_available: bool,
        message_id: str,
        run_id: str,
        occurred_at: datetime,
        queue_only: bool,
    ) -> RunAcceptanceResult:
        with self._database.sessions() as database_session:
            database_session.execute(text("BEGIN IMMEDIATE"))
            existing = database_session.scalar(
                select(MessageIdempotencyRecord).where(
                    MessageIdempotencyRecord.session_id == request.session_id,
                    MessageIdempotencyRecord.idempotency_key == request.idempotency_key,
                )
            )
            if existing is not None:
                if existing.normalized_body != request.normalized_body:
                    raise IdempotencyConflictError(
                        "The idempotency key was already used with a different request."
                    )
                database_session.rollback()
                return self._load_result(existing.message_id, existing.run_id)

            session_record = database_session.get(SessionRecord, request.session_id)
            if session_record is None:
                raise RunAcceptanceNotFoundError(
                    f"Session '{request.session_id}' was not found."
                )
            if (
                database_session.get(
                    WorkspaceRemovalRecord, session_record.workspace_id
                )
                is not None
            ):
                raise WorkspaceRemovedAcceptanceError(
                    "Removed workspaces cannot start a run."
                )
            if (
                database_session.get(SessionArchiveRecord, request.session_id)
                is not None
            ):
                raise SessionArchivedAcceptanceError(
                    "Archived sessions cannot start a run."
                )
            if request.map_context["workspace_id"] != session_record.workspace_id:
                raise InvalidMapContextError(
                    "The map context does not belong to the current workspace."
                )
            selection = request.model_selection
            connection = database_session.get(
                ModelConnectionRecord, selection.connection_id
            )
            if connection is None:
                raise RunAcceptanceNotFoundError(
                    f"Model connection '{selection.connection_id}' was not found."
                )
            entry = database_session.get(
                ModelCatalogEntryRecord,
                (selection.connection_id, selection.model_id),
            )
            self._validate_model(
                connection,
                entry,
                selection.reasoning_effort,
                credential_available,
            )

            model_snapshot = ModelSnapshotPayload(
                connection_id=connection.id,
                provider_type=connection.provider_type,
                protocol=connection.protocol,
                base_url=connection.base_url,
                auth_mode=connection.auth_mode,
                model_id=selection.model_id,
                reasoning_effort=selection.reasoning_effort,
                connection_revision=connection.revision,
                max_tokens_field=connection.max_tokens_field,
                include_usage=connection.include_usage,
                max_output_tokens=256_000
                if connection.protocol == ModelProtocol.DEEPSEEK_MESSAGES
                else MAX_MODEL_OUTPUT_TOKENS,
                retry_policy=connection.retry_policy,
            )
            budget_limits = BudgetLimitsPayload(
                model_calls=MAX_MODEL_CALLS,
                tool_calls=MAX_TOOL_CALLS,
                active_milliseconds=MAX_ACTIVE_MILLISECONDS,
                output_codepoints=MAX_OUTPUT_CODEPOINTS,
            )
            state = _session_state(database_session, request.session_id)
            events = (
                InboxSplicedEvent(
                    session_id=request.session_id,
                    event_type="agent/inbox/spliced",
                    payload=InboxSplicedPayload(
                        target="next-turn",
                        target_run_id=run_id,
                        start=len(state.next_turn),
                        delete_count=0,
                        messages=[
                            InboxMessagePayload(
                                message_id=message_id,
                                content=request.content,
                                attachments=resolve_references(
                                    database_session,
                                    request.session_id,
                                    request.attachment_ids,
                                ),
                                map_context=request.map_context,
                                turn=QueuedTurnPayload(
                                    run_id=run_id,
                                    queue_sequence=queue_sequence,
                                    model_snapshot=model_snapshot,
                                    budget_limits=budget_limits,
                                ),
                            )
                        ],
                    ),
                    occurred_at=occurred_at,
                ),
            )
            if (
                not queue_only
                and state.queue_mode == "manual"
                and not any(
                    run.state.value in NONTERMINAL_RUN_STATE_VALUES
                    for run in state.runs
                )
            ):
                events += (
                    QueueReorderedEvent(
                        session_id=request.session_id,
                        event_type="agent/queue/reordered",
                        payload=QueueReorderedPayload(
                            message_ids=[
                                message_id,
                                *(item.message_id for item in state.next_turn),
                            ]
                        ),
                        occurred_at=occurred_at,
                    ),
                    QueueDispatchedEvent(
                        session_id=request.session_id,
                        event_type="agent/queue/dispatched",
                        payload=QueueDispatchedPayload(message_id=message_id),
                        occurred_at=occurred_at,
                    ),
                )
            self._projections.commit_in_transaction(
                database_session,
                EventBatch(
                    session_id=request.session_id,
                    run_id=None,
                    events=events,
                ),
            )
            database_session.add(
                MessageIdempotencyRecord(
                    session_id=request.session_id,
                    idempotency_key=request.idempotency_key,
                    normalized_body=request.normalized_body,
                    message_id=message_id,
                    run_id=run_id,
                    created_at=occurred_at,
                )
            )
            preference = database_session.get(
                SessionPreferenceRecord, request.session_id
            )
            if preference is None:
                preference = SessionPreferenceRecord(session_id=request.session_id)
                database_session.add(preference)
            preference.connection_id = selection.connection_id
            preference.model_id = selection.model_id
            preference.reasoning_effort = selection.reasoning_effort
            preference.updated_at = occurred_at
            session_record.updated_at = occurred_at
            workspace_record = database_session.get(
                WorkspaceRecord, session_record.workspace_id
            )
            if workspace_record is None:
                raise RuntimeError(
                    f"Session '{request.session_id}' references a missing workspace."
                )
            workspace_record.updated_at = occurred_at
            database_session.commit()

        return self._load_result(message_id, run_id)

    def steer(
        self,
        request: RunAcceptanceRequest,
        *,
        run_id: str,
        message_id: str,
        occurred_at: datetime,
    ) -> RunAcceptanceResult:
        with self._database.sessions() as database_session:
            database_session.execute(text("BEGIN IMMEDIATE"))
            existing = database_session.scalar(
                select(MessageIdempotencyRecord).where(
                    MessageIdempotencyRecord.session_id == request.session_id,
                    MessageIdempotencyRecord.idempotency_key == request.idempotency_key,
                )
            )
            if existing is not None:
                if existing.normalized_body != request.normalized_body:
                    raise IdempotencyConflictError(
                        "The idempotency key belongs to another input."
                    )
                existing_message_id, existing_run_id = (
                    existing.message_id,
                    existing.run_id,
                )
                database_session.rollback()
                return self._load_result(existing_message_id, existing_run_id)
            run = database_session.get(RunRecord, run_id)
            snapshot = database_session.get(RunModelSnapshotRecord, run_id)
            if run is None or snapshot is None or run.session_id != request.session_id:
                raise RunAcceptanceNotFoundError("The steering target is unavailable.")
            if run.state not in NONTERMINAL_RUN_STATE_VALUES:
                raise RunAcceptanceConflictError(
                    "The steering target has already finished."
                )
            session = database_session.get(SessionRecord, request.session_id)
            if session is None:
                raise RunAcceptanceNotFoundError("The steering session is unavailable.")
            if (
                database_session.get(SessionArchiveRecord, request.session_id)
                is not None
            ):
                raise SessionArchivedAcceptanceError(
                    "Archived sessions cannot accept input."
                )
            if (
                database_session.get(WorkspaceRemovalRecord, session.workspace_id)
                is not None
            ):
                raise WorkspaceRemovedAcceptanceError(
                    "Removed workspaces cannot accept input."
                )
            if request.map_context["workspace_id"] != session.workspace_id:
                raise InvalidMapContextError(
                    "The steering map belongs to another workspace."
                )
            selection = request.model_selection
            if (
                selection.connection_id,
                selection.model_id,
                selection.reasoning_effort,
            ) != (
                snapshot.connection_id,
                snapshot.model_id,
                snapshot.reasoning_effort,
            ):
                raise RunAcceptanceConflictError(
                    "Steering must preserve the active run's model selection."
                )
            records = database_session.scalars(
                select(SessionEventRecord)
                .where(
                    SessionEventRecord.session_id == request.session_id,
                )
                .order_by(SessionEventRecord.sequence)
            ).all()
            state = reduce_session(
                run_records.event_to_domain(record) for record in records
            )
            if len(state.next_step) >= 32:
                raise RunAcceptanceConflictError("The next-step inbox is full.")
            self._projections.commit_in_transaction(
                database_session,
                EventBatch(
                    session_id=request.session_id,
                    run_id=None,
                    events=(
                        InboxSplicedEvent(
                            session_id=request.session_id,
                            event_type="agent/inbox/spliced",
                            payload=InboxSplicedPayload(
                                target="next-step",
                                target_run_id=run_id,
                                start=len(state.next_step),
                                delete_count=0,
                                messages=[
                                    InboxMessagePayload(
                                        message_id=message_id,
                                        content=request.content,
                                        attachments=resolve_references(
                                            database_session,
                                            request.session_id,
                                            request.attachment_ids,
                                        ),
                                        map_context=request.map_context,
                                    )
                                ],
                            ),
                            occurred_at=occurred_at,
                        ),
                    ),
                ),
            )
            database_session.add(
                MessageIdempotencyRecord(
                    session_id=request.session_id,
                    idempotency_key=request.idempotency_key,
                    normalized_body=request.normalized_body,
                    message_id=message_id,
                    run_id=run_id,
                    created_at=occurred_at,
                )
            )
            session.updated_at = occurred_at
            database_session.commit()
        return self._load_result(message_id, run_id)

    def claim_next_turn(
        self, session_id: str, occurred_at: datetime
    ) -> RunAcceptanceResult | None:
        with self._database.sessions() as database_session:
            database_session.execute(text("BEGIN IMMEDIATE"))
            if (
                database_session.scalar(
                    select(RunRecord.id).where(
                        RunRecord.session_id == session_id,
                        RunRecord.state.in_(NONTERMINAL_RUN_STATE_VALUES),
                    )
                )
                is not None
            ):
                return None
            state = _session_state(database_session, session_id)
            if not state.next_turn:
                return None
            item = state.next_turn[0]
            if (
                state.queue_mode == "manual"
                and state.dispatch_message_id != item.message_id
            ):
                return None
            turn = item.turn
            if turn is None:
                raise RuntimeError("Queued input has no turn configuration.")
            self._projections.commit_in_transaction(
                database_session,
                EventBatch(
                    session_id=session_id,
                    run_id=None,
                    events=(
                        InboxSplicedEvent(
                            session_id=session_id,
                            event_type="agent/inbox/spliced",
                            payload=InboxSplicedPayload(
                                target="next-turn",
                                target_run_id=turn.run_id,
                                start=0,
                                delete_count=1,
                                messages=[],
                                disposition="claim",
                            ),
                            occurred_at=occurred_at,
                        ),
                        *turn_events(session_id, item, occurred_at),
                    ),
                ),
            )
            database_session.commit()
        return self._load_result(item.message_id, turn.run_id)

    @staticmethod
    def _validate_model(
        connection: ModelConnectionRecord,
        entry: ModelCatalogEntryRecord | None,
        reasoning_effort: str | None,
        credential_available: bool,
    ) -> None:
        if not connection.enabled or connection.management_status != "ready":
            raise ModelUnverifiedError("The selected model connection is unavailable.")
        if (
            connection.auth_mode == ModelAuthMode.API_KEY.value
            and not credential_available
        ):
            raise CredentialUnavailableError(
                "The selected model credential is not configured."
            )
        if connection.credential_status != "ready":
            raise CredentialUnavailableError(
                "The selected model credential is not ready."
            )
        if (
            entry is None
            or entry.revision != connection.revision
            or entry.availability != "available"
            or entry.model_id not in connection.enabled_model_ids
            or entry.text_check != "passed"
            or entry.tool_check != "passed"
        ):
            raise ModelUnverifiedError(
                "The selected model is not enabled and verified for agent runs."
            )
        if (
            reasoning_effort is not None
            and reasoning_effort not in entry.reasoning_efforts
        ):
            raise UnsupportedModelCapabilityError(
                "The selected reasoning effort is not supported by this model."
            )

    def _load_result(self, message_id: str, run_id: str) -> RunAcceptanceResult:
        with self._database.sessions() as database_session:
            message_record = database_session.get(MessageRecord, message_id)
            run_record = database_session.get(RunRecord, run_id)
            snapshot_record = database_session.get(RunModelSnapshotRecord, run_id)
            if message_record is None:
                raise RuntimeError("Accepted message projection is missing.")
            message = _message_to_domain(message_record)
            if run_record is None:
                if message_record.run_id is not None:
                    raise RuntimeError("Accepted turn projection is missing.")
                return RunAcceptanceResult(message=message, run=None)
            if snapshot_record is None:
                raise RuntimeError("Accepted model snapshot is missing.")
            run = run_records.run_to_domain(run_record)
            snapshot = run_records.snapshot_to_domain(snapshot_record)
            tool_records = database_session.scalars(
                select(ToolCallRecord)
                .where(ToolCallRecord.run_id == run_id)
                .order_by(
                    ToolCallRecord.step,
                    ToolCallRecord.attempt,
                    ToolCallRecord.batch_index,
                )
            ).all()
            tool_calls = tuple(
                run_records.tool_call_to_domain(record) for record in tool_records
            )
        return RunAcceptanceResult(
            message=message,
            run=RunDetails(
                run=run,
                model_snapshot=snapshot,
                tool_calls=tool_calls,
            ),
        )


def _message_to_domain(record: MessageRecord) -> Message:
    return Message(
        id=record.id,
        session_id=record.session_id,
        sequence=record.sequence,
        role=cast(MessageRole, record.role),
        content=record.content,
        attachments=tuple(REFERENCE.validate_python(ref) for ref in record.attachments),
        run_id=record.run_id,
        step=record.step,
        attempt=record.attempt,
        status=cast(MessageStatus, record.status),
        content_length=record.content_length,
        updated_sequence=record.updated_sequence,
        created_at=as_utc(record.created_at),
        updated_at=as_utc(record.updated_at),
    )


def _session_state(database_session: Session, session_id: str) -> ReducedSession:
    records = database_session.scalars(
        select(SessionEventRecord)
        .where(SessionEventRecord.session_id == session_id)
        .order_by(SessionEventRecord.sequence)
    ).all()
    return reduce_session(run_records.event_to_domain(record) for record in records)
