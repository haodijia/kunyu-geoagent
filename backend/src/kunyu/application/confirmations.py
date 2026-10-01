from collections.abc import Callable
from datetime import UTC, datetime
from time import monotonic_ns
from typing import Literal
from uuid import uuid4

from pydantic import JsonValue, TypeAdapter
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session as DatabaseSession

from kunyu.agent.runtime.events import (
    BudgetReservedEvent,
    BudgetReservedPayload,
    BudgetSettledEvent,
    BudgetSettledPayload,
    BudgetUsagePayload,
    ConfirmationRequestedEvent,
    ConfirmationRequestedPayload,
    ConfirmationResolvedEvent,
    ConfirmationResolvedPayload,
    EventBatch,
    EventDraft,
    RunProgressEvent,
    RunProgressPayload,
    RunTerminalEvent,
    RunTerminalPayload,
    ToolCompletedEvent,
    ToolCompletedPayload,
    ToolProgressEvent,
    ToolProgressPayload,
)
from kunyu.agent.runtime.tools import PolicyDecision
from kunyu.agent.runtime.tools import ToolCall as PolicyToolCall
from kunyu.agent.tools.registry import ToolPolicyGate, ToolRegistryFactory
from kunyu.application.sessions import SessionNotFoundError
from kunyu.domain.confirmations import (
    Confirmation,
    ConfirmationConflictError,
    ConfirmationDecisionResult,
    ConfirmationNotFoundError,
    ConfirmationPolicyError,
    ConfirmationStatus,
)
from kunyu.persistence import run_records
from kunyu.persistence.agent_projections import SQLAlchemyAgentProjectionService
from kunyu.persistence.confirmations import (
    SQLAlchemyConfirmationRepository,
    confirmation_to_domain,
)
from kunyu.persistence.database import Database
from kunyu.persistence.models import (
    ConfirmationRecord,
    RunModelSnapshotRecord,
    RunRecord,
    SessionRecord,
    ToolCallRecord,
)

TOOL_ACTIVE_TIME_SLICE_MILLISECONDS = 5_000
_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])


class ConfirmationService:
    def __init__(
        self,
        database: Database,
        tool_registries: ToolRegistryFactory,
        policy: ToolPolicyGate,
        *,
        confirmation_id_factory: Callable[[], str] | None = None,
        operation_id_factory: Callable[[], str] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._database = database
        self._tool_registries = tool_registries
        self._policy = policy
        self._projections = SQLAlchemyAgentProjectionService(database)
        self._repository = SQLAlchemyConfirmationRepository(database)
        self._confirmation_id_factory = confirmation_id_factory or _new_confirmation_id
        self._operation_id_factory = operation_id_factory or _new_operation_id
        self._clock = clock or _utc_now

    def list_for_session(self, session_id: str) -> tuple[Confirmation, ...]:
        confirmations = self._repository.list_for_session(session_id)
        if confirmations is None:
            raise SessionNotFoundError(session_id)
        return confirmations

    def request(self, run_id: str, tool_call_id: str) -> Confirmation:
        with self._database.sessions() as database_session:
            database_session.execute(text("BEGIN IMMEDIATE"))
            run_record = database_session.get(RunRecord, run_id)
            tool_record = database_session.get(ToolCallRecord, tool_call_id)
            if run_record is None or tool_record is None:
                raise ConfirmationNotFoundError(tool_call_id)
            if (
                tool_record.run_id != run_id
                or tool_record.session_id != run_record.session_id
            ):
                raise ConfirmationConflictError(
                    "The tool call does not belong to the requested run."
                )
            existing = database_session.scalar(
                select(ConfirmationRecord).where(
                    ConfirmationRecord.tool_call_id == tool_call_id
                )
            )
            if existing is not None:
                database_session.rollback()
                return confirmation_to_domain(existing)
            if (
                run_record.state != "tool_running"
                or run_record.next_tool_index != tool_record.batch_index
                or tool_record.status != "pending"
            ):
                raise ConfirmationConflictError(
                    "Only the current pending write tool can request confirmation."
                )
            session_record = database_session.get(SessionRecord, run_record.session_id)
            if session_record is None:
                raise ConfirmationConflictError(
                    "The confirmation scope no longer exists."
                )

            arguments = self._validate_exact_snapshot(run_id, tool_record)
            handler = self._tool_registries.require_write_handler(tool_record.name)
            confirmation_id = self._confirmation_id_factory()
            now = self._clock()
            event = ConfirmationRequestedEvent(
                session_id=run_record.session_id,
                run_id=run_id,
                event_type="confirmation.requested",
                payload=ConfirmationRequestedPayload(
                    confirmation_id=confirmation_id,
                    tool_call_id=tool_call_id,
                    workspace_id=session_record.workspace_id,
                    name=tool_record.name,
                    arguments=arguments,
                    summary=handler.summary,
                    side_effect=handler.side_effect,
                ),
                occurred_at=now,
            )
            session_id = run_record.session_id
            database_session.expunge_all()
            self._projections.commit_in_transaction(
                database_session,
                EventBatch(session_id=session_id, run_id=run_id, events=(event,)),
            )
            database_session.commit()

        confirmation = self._repository.get(confirmation_id)
        if confirmation is None:
            raise RuntimeError("Confirmation projection was not persisted.")
        return confirmation

    def get(self, confirmation_id: str) -> Confirmation:
        confirmation = self._repository.get(confirmation_id)
        if confirmation is None:
            raise ConfirmationNotFoundError(confirmation_id)
        return confirmation

    def approve(
        self, confirmation_id: str, queue_sequence: int | None
    ) -> ConfirmationDecisionResult:
        return self._decide(
            confirmation_id,
            "approved",
            queue_sequence=queue_sequence,
        )

    def reject(self, confirmation_id: str) -> ConfirmationDecisionResult:
        return self._decide(confirmation_id, "rejected")

    def cancel_for_run(self, run_id: str) -> ConfirmationDecisionResult:
        with self._database.sessions() as database_session:
            database_session.execute(text("BEGIN IMMEDIATE"))
            run_record = database_session.get(RunRecord, run_id)
            if run_record is None:
                raise ConfirmationConflictError("The run does not exist.")
            if run_record.pending_confirmation_id is not None:
                confirmation_id = run_record.pending_confirmation_id
                database_session.rollback()
                return self._decide(confirmation_id, "cancelled")
            confirmation_record = database_session.scalar(
                select(ConfirmationRecord)
                .where(ConfirmationRecord.run_id == run_id)
                .order_by(ConfirmationRecord.created_at.desc())
                .limit(1)
            )
            if confirmation_record is None:
                raise ConfirmationConflictError(
                    "The run has no confirmation-owned continuation to cancel."
                )
            if run_record.state in {"completed", "failed", "cancelled"}:
                database_session.rollback()
                return self._load_result(
                    confirmation_record.id,
                    continuation_required=False,
                )
            if run_record.state != "ready" or confirmation_record.status != "approved":
                raise ConfirmationConflictError(
                    "The confirmation-owned continuation cannot be cancelled now."
                )
            now = self._clock()
            event = RunTerminalEvent(
                session_id=run_record.session_id,
                run_id=run_id,
                event_type="run.cancelled",
                payload=RunTerminalPayload(
                    state="cancelled",
                    reason="Run cancelled after the confirmed local write.",
                    budget=_budget_usage(run_record),
                ),
                occurred_at=now,
            )
            confirmation_id = confirmation_record.id
            session_id = run_record.session_id
            database_session.expunge_all()
            self._projections.commit_in_transaction(
                database_session,
                EventBatch(session_id=session_id, run_id=run_id, events=(event,)),
            )
            database_session.commit()
        return self._load_result(
            confirmation_id,
            continuation_required=False,
        )

    def _decide(
        self,
        confirmation_id: str,
        decision: Literal["approved", "rejected", "cancelled"],
        *,
        queue_sequence: int | None = None,
    ) -> ConfirmationDecisionResult:
        with self._database.sessions() as database_session:
            database_session.execute(text("BEGIN IMMEDIATE"))
            confirmation_record = database_session.get(
                ConfirmationRecord, confirmation_id
            )
            if confirmation_record is None:
                raise ConfirmationNotFoundError(confirmation_id)
            current_status = ConfirmationStatus(confirmation_record.status)
            if current_status.value == decision:
                database_session.rollback()
                return self._load_result(
                    confirmation_id,
                    continuation_required=(decision == "approved"),
                )
            if current_status is not ConfirmationStatus.PENDING:
                raise ConfirmationConflictError(
                    "The confirmation has already been decided differently."
                )

            run_record = database_session.get(RunRecord, confirmation_record.run_id)
            tool_record = database_session.get(
                ToolCallRecord, confirmation_record.tool_call_id
            )
            if run_record is None or tool_record is None:
                raise ConfirmationConflictError(
                    "The confirmation target no longer exists."
                )
            self._require_pending_snapshot(confirmation_record, run_record, tool_record)
            now = self._clock()
            resolved = ConfirmationResolvedEvent(
                session_id=confirmation_record.session_id,
                run_id=confirmation_record.run_id,
                event_type="confirmation.resolved",
                payload=ConfirmationResolvedPayload(
                    confirmation_id=confirmation_id,
                    tool_call_id=confirmation_record.tool_call_id,
                    decision=decision,
                    decided_at=now,
                ),
                occurred_at=now,
            )

            events: tuple[EventDraft, ...]
            if decision == "approved":
                if queue_sequence is None or queue_sequence <= 0:
                    raise ConfirmationConflictError(
                        "Approved continuations require a queue sequence."
                    )
                batch_size = database_session.scalar(
                    select(func.count())
                    .select_from(ToolCallRecord)
                    .where(
                        ToolCallRecord.run_id == run_record.id,
                        ToolCallRecord.step == run_record.step,
                        ToolCallRecord.attempt == run_record.attempt,
                    )
                )
                events = self._approve_events(
                    database_session,
                    confirmation_record,
                    run_record,
                    tool_record,
                    resolved,
                    now,
                    queue_sequence,
                    int(batch_size or 0),
                )
            else:
                events = (
                    resolved,
                    RunTerminalEvent(
                        session_id=confirmation_record.session_id,
                        run_id=confirmation_record.run_id,
                        event_type="run.cancelled",
                        payload=RunTerminalPayload(
                            state="cancelled",
                            reason=(
                                "User rejected the requested local write."
                                if decision == "rejected"
                                else "Run cancelled while awaiting confirmation."
                            ),
                            budget=_budget_usage(run_record),
                        ),
                        occurred_at=now,
                    ),
                )

            session_id = confirmation_record.session_id
            run_id = confirmation_record.run_id
            database_session.expunge_all()
            self._projections.commit_in_transaction(
                database_session,
                EventBatch(session_id=session_id, run_id=run_id, events=events),
            )
            database_session.commit()

        return self._load_result(
            confirmation_id,
            continuation_required=(decision == "approved"),
        )

    def _approve_events(
        self,
        database_session: DatabaseSession,
        confirmation: ConfirmationRecord,
        run: RunRecord,
        tool: ToolCallRecord,
        resolved: ConfirmationResolvedEvent,
        now: datetime,
        queue_sequence: int,
        batch_size: int,
    ) -> tuple[EventDraft, ...]:
        arguments = self._validate_exact_snapshot(run.id, tool)
        if arguments != confirmation.arguments:
            raise ConfirmationConflictError(
                "The confirmed arguments no longer match the tool call."
            )
        remaining_milliseconds = run.max_active_milliseconds - run.active_milliseconds
        if run.tool_calls >= run.max_tool_calls or remaining_milliseconds <= 0:
            raise ConfirmationConflictError("The run tool budget is exhausted.")
        reserved_milliseconds = min(
            TOOL_ACTIVE_TIME_SLICE_MILLISECONDS, remaining_milliseconds
        )
        operation_id = self._operation_id_factory()
        handler = self._tool_registries.require_write_handler(tool.name)
        call = PolicyToolCall(
            run_id=run.id,
            call_id=tool.id,
            name=tool.name,
            arguments=arguments,
        )
        started_ns = monotonic_ns()
        result = _JSON_OBJECT_ADAPTER.validate_python(
            handler.execute(database_session, confirmation.workspace_id, call, now)
        )
        actual_milliseconds = min(
            reserved_milliseconds,
            max(0, (monotonic_ns() - started_ns) // 1_000_000),
        )
        next_tool_index = tool.batch_index + 1
        common = {
            "tool_call_id": tool.id,
            "provider_call_id": tool.provider_call_id,
            "message_id": tool.message_id,
            "batch_index": tool.batch_index,
        }
        return (
            resolved,
            BudgetReservedEvent(
                session_id=confirmation.session_id,
                run_id=confirmation.run_id,
                event_type="run.budget_reserved",
                payload=BudgetReservedPayload(
                    operation_id=operation_id,
                    operation_type="tool",
                    operation_count=1,
                    reserved_milliseconds=reserved_milliseconds,
                ),
                occurred_at=now,
            ),
            ToolProgressEvent(
                session_id=confirmation.session_id,
                run_id=confirmation.run_id,
                event_type="tool.started",
                payload=ToolProgressPayload(
                    **common,
                    next_tool_index=tool.batch_index,
                ),
                occurred_at=now,
            ),
            BudgetSettledEvent(
                session_id=confirmation.session_id,
                run_id=confirmation.run_id,
                event_type="run.budget_settled",
                payload=BudgetSettledPayload(
                    operation_id=operation_id,
                    operation_type="tool",
                    operation_count=1,
                    reserved_milliseconds=reserved_milliseconds,
                    actual_milliseconds=actual_milliseconds,
                    charged_milliseconds=actual_milliseconds,
                    crashed=False,
                ),
                occurred_at=now,
            ),
            ToolCompletedEvent(
                session_id=confirmation.session_id,
                run_id=confirmation.run_id,
                event_type="tool.completed",
                payload=ToolCompletedPayload(
                    **common,
                    next_tool_index=next_tool_index,
                    result=result,
                ),
                occurred_at=now,
            ),
            RunProgressEvent(
                session_id=confirmation.session_id,
                run_id=confirmation.run_id,
                event_type="run.queued",
                payload=RunProgressPayload(
                    step=run.step,
                    attempt=run.attempt,
                    resume_phase=("tool" if next_tool_index < batch_size else "model"),
                    next_tool_index=next_tool_index,
                    requires_resume=False,
                    queue_sequence=queue_sequence,
                    reason=None,
                    budget=BudgetUsagePayload(
                        model_calls=run.model_calls,
                        tool_calls=run.tool_calls + 1,
                        active_milliseconds=(
                            run.active_milliseconds + actual_milliseconds
                        ),
                        output_codepoints=run.output_codepoints,
                        input_tokens=run.input_tokens,
                        output_tokens=run.output_tokens,
                        total_tokens=run.total_tokens,
                    ),
                ),
                occurred_at=now,
            ),
        )

    def _validate_exact_snapshot(
        self, run_id: str, tool: ToolCallRecord
    ) -> dict[str, JsonValue]:
        call = PolicyToolCall(
            run_id=run_id,
            call_id=tool.id,
            name=tool.name,
            arguments=tool.arguments,
        )
        registered_tool = self._tool_registries.for_run(run_id).require(tool.name)
        arguments = _JSON_OBJECT_ADAPTER.validate_python(
            dict(registered_tool.validate(tool.arguments))
        )
        if arguments != tool.arguments:
            raise ConfirmationConflictError(
                "The stored tool arguments are not the validated snapshot."
            )
        if self._policy.decide(call) is not PolicyDecision.CONFIRM:
            raise ConfirmationPolicyError(
                "The tool is not authorized through the confirmation path."
            )
        return arguments

    @staticmethod
    def _require_pending_snapshot(
        confirmation: ConfirmationRecord,
        run: RunRecord,
        tool: ToolCallRecord,
    ) -> None:
        if (
            run.state != "waiting_confirmation"
            or run.pending_confirmation_id != confirmation.id
            or tool.id != confirmation.tool_call_id
            or tool.run_id != run.id
            or tool.session_id != run.session_id
            or tool.status != "pending"
            or tool.batch_index != run.next_tool_index
            or tool.name != confirmation.name
            or tool.arguments != confirmation.arguments
        ):
            raise ConfirmationConflictError(
                "The pending confirmation no longer matches its exact tool snapshot."
            )

    def _load_result(
        self, confirmation_id: str, *, continuation_required: bool
    ) -> ConfirmationDecisionResult:
        confirmation = self._repository.get(confirmation_id)
        if confirmation is None:
            raise ConfirmationNotFoundError(confirmation_id)
        with self._database.sessions() as database_session:
            run_record = database_session.get(RunRecord, confirmation.run_id)
            tool_record = database_session.get(
                ToolCallRecord, confirmation.tool_call_id
            )
            snapshot_record = database_session.get(
                RunModelSnapshotRecord, confirmation.run_id
            )
            if run_record is None or tool_record is None or snapshot_record is None:
                raise ConfirmationConflictError(
                    "The confirmation projection is incomplete."
                )
            run = run_records.run_to_domain(run_record)
            tool = run_records.tool_call_to_domain(tool_record)
            snapshot = run_records.snapshot_to_domain(snapshot_record)
            tool_calls = tuple(
                run_records.tool_call_to_domain(record)
                for record in database_session.scalars(
                    select(ToolCallRecord)
                    .where(ToolCallRecord.run_id == confirmation.run_id)
                    .order_by(
                        ToolCallRecord.step,
                        ToolCallRecord.attempt,
                        ToolCallRecord.batch_index,
                    )
                ).all()
            )
        return ConfirmationDecisionResult(
            confirmation=confirmation,
            tool_call=tool,
            run=run,
            model_snapshot=snapshot,
            tool_calls=tool_calls,
            continuation_required=(
                continuation_required
                and confirmation.status is ConfirmationStatus.APPROVED
                and run.state.value == "ready"
            ),
        )


def _budget_usage(run: RunRecord) -> BudgetUsagePayload:
    return BudgetUsagePayload(
        model_calls=run.model_calls,
        tool_calls=run.tool_calls,
        active_milliseconds=run.active_milliseconds,
        output_codepoints=run.output_codepoints,
        input_tokens=run.input_tokens,
        output_tokens=run.output_tokens,
        total_tokens=run.total_tokens,
    )


def _new_confirmation_id() -> str:
    return f"cnf_{uuid4().hex}"


def _new_operation_id() -> str:
    return f"op_{uuid4().hex}"


def _utc_now() -> datetime:
    return datetime.now(UTC)
