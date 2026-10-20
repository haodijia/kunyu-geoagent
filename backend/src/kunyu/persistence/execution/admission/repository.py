from datetime import datetime

from sqlalchemy import select, text

from kunyu.agent.runtime.events.run import BudgetLimitsPayload, ModelSnapshotPayload
from kunyu.agent.runtime.events.session import (
    InboxMessagePayload,
    InboxSplicedEvent,
    InboxSplicedPayload,
    QueueDispatchedEvent,
    QueueDispatchedPayload,
    QueuedTurnPayload,
    QueueReorderedEvent,
    QueueReorderedPayload,
    SubagentStartedEvent,
    SubagentStartedPayload,
)
from kunyu.agent.runtime.events.store import EventBatch
from kunyu.agent.runtime.projection.session_reducer import reduce_session
from kunyu.domain.execution.run_acceptance import (
    IdempotencyConflictError,
    InvalidMapContextError,
    RunAcceptanceConflictError,
    RunAcceptanceNotFoundError,
    RunAcceptanceRequest,
    RunAcceptanceResult,
    SessionArchivedAcceptanceError,
    WorkspaceRemovedAcceptanceError,
)
from kunyu.domain.execution.runs import NONTERMINAL_RUN_STATE_VALUES
from kunyu.domain.models.model_images import ModelImageInput
from kunyu.domain.models.model_reasoning import (
    ModelReasoningSettings,
    reasoning_parameters,
)
from kunyu.persistence.conversation.attachments import resolve_references
from kunyu.persistence.database import Database
from kunyu.persistence.execution import run_records
from kunyu.persistence.execution.admission.events import turn_events
from kunyu.persistence.execution.admission.snapshots import _session_state, load_result
from kunyu.persistence.execution.admission.validation import (
    require_image_input,
    validate_model,
)
from kunyu.persistence.execution.agent_projections import (
    SQLAlchemyAgentProjectionService,
)
from kunyu.persistence.records.conversation import (
    MessageIdempotencyRecord,
    SessionArchiveRecord,
    SessionPreferenceRecord,
    SessionRecord,
)
from kunyu.persistence.records.execution import (
    RunModelSnapshotRecord,
    RunRecord,
    SessionEventRecord,
    SubagentRecord,
)
from kunyu.persistence.records.models import (
    ModelCatalogEntryRecord,
    ModelConnectionRecord,
)
from kunyu.persistence.records.workspaces import WorkspaceRecord, WorkspaceRemovalRecord

MAX_ACTIVE_MILLISECONDS = 1_200_000


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
        return load_result(self._database, message_id, run_id)

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
                return load_result(self._database, existing.message_id, existing.run_id)

            session_record = database_session.get(SessionRecord, request.session_id)
            if (
                database_session.get(SubagentRecord, request.session_id) is not None
                and request.source != "tool-subagents"
            ):
                raise RunAcceptanceConflictError(
                    "Child inputs are admitted only by their parent delegation."
                )
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
            validate_model(
                connection,
                entry,
                selection.reasoning_effort,
                credential_available,
            )

            attachments = resolve_references(
                database_session, request.session_id, request.attachment_ids
            )
            image_input = ModelImageInput.model_validate(entry.image_input)
            require_image_input(attachments, image_input)
            model_snapshot = ModelSnapshotPayload(
                connection_id=connection.id,
                provider_type=connection.provider_type,
                protocol=connection.protocol,
                base_url=connection.base_url,
                auth_mode=connection.auth_mode,
                model_id=selection.model_id,
                reasoning_effort=selection.reasoning_effort,
                reasoning_parameters=reasoning_parameters(
                    connection.protocol,
                    connection.provider_type,
                    selection.reasoning_effort
                    if selection.reasoning_effort is not None
                    or entry.reasoning_settings is not None
                    else entry.reasoning_default,
                    ModelReasoningSettings.model_validate(entry.reasoning_settings)
                    if entry.reasoning_settings is not None
                    else None,
                ),
                connection_revision=connection.revision,
                max_tokens_field=connection.max_tokens_field,
                include_usage=connection.include_usage,
                image_input=image_input,
                max_output_tokens=entry.max_output_tokens,
                context_window=entry.context_window,
                retention_tokens=entry.retention_tokens,
                retry_policy=connection.retry_policy,
            )
            budget_limits = BudgetLimitsPayload(
                active_milliseconds=MAX_ACTIVE_MILLISECONDS,
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
                                source=request.source,
                                attachments=attachments,
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
            child = database_session.get(SubagentRecord, request.session_id)
            if child is not None:
                self._projections.commit_in_transaction(
                    database_session,
                    EventBatch(
                        session_id=child.parent_session_id,
                        run_id=None,
                        events=(
                            SubagentStartedEvent(
                                session_id=child.parent_session_id,
                                event_type="subagent/started",
                                payload=SubagentStartedPayload(
                                    child_session_id=request.session_id,
                                    child_run_id=run_id,
                                    owner_run_id=child.parent_run_id,
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

        return load_result(self._database, message_id, run_id)

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
                return load_result(self._database, existing_message_id, existing_run_id)
            run = database_session.get(RunRecord, run_id)
            if (
                database_session.get(SubagentRecord, request.session_id) is not None
                and request.source != "tool-subagents"
            ):
                raise RunAcceptanceConflictError(
                    "Delegated child inputs cannot be steered through user messages."
                )
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
            attachments = resolve_references(
                database_session, request.session_id, request.attachment_ids
            )
            require_image_input(
                attachments, ModelImageInput.model_validate(snapshot.image_input)
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
                                        source=request.source,
                                        attachments=attachments,
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
        return load_result(self._database, message_id, run_id)

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
        return load_result(self._database, item.message_id, turn.run_id)
