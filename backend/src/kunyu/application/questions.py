"""Own durable question requests and atomic, idempotent human decisions."""

import logging
from datetime import UTC, datetime
from time import monotonic_ns
from uuid import uuid4

from pydantic import JsonValue, TypeAdapter
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from kunyu.agent.runtime.events import (
    BudgetReservedEvent,
    BudgetReservedPayload,
    BudgetSettledEvent,
    BudgetSettledPayload,
    EventBatch,
    QuestionRequestedEvent,
    QuestionRequestedPayload,
    QuestionResolvedEvent,
    QuestionResolvedPayload,
    RunProgressEvent,
    RunProgressPayload,
    RunState,
    ToolCompletedEvent,
    ToolCompletedPayload,
    ToolFailedEvent,
    ToolFailedPayload,
    ToolProgressEvent,
    ToolProgressPayload,
    validate_event_draft,
)
from kunyu.agent.runtime.questions import QuestionAnswers
from kunyu.agent.runtime.run_state import ReducedRun, ReducedToolCall
from kunyu.agent.runtime.runner_types import budget_usage, current_tool_batch
from kunyu.agent.runtime.session_reducer import reduce_session
from kunyu.agent.runtime.session_state import ReducedSession
from kunyu.agent.runtime.tool_content import TOOL_CONTENT_ADAPTER
from kunyu.agent.runtime.tools import ToolCall, ToolExecutionError, ToolResult
from kunyu.agent.tools.registry import ToolRegistryFactory
from kunyu.domain.questions import (
    QuestionConflictError,
    QuestionDecision,
    QuestionNotFoundError,
    QuestionSnapshot,
)
from kunyu.persistence.agent_projections import SQLAlchemyAgentProjectionService
from kunyu.persistence.database import Database
from kunyu.persistence.models import RunRecord, SessionEventRecord, SessionRecord
from kunyu.persistence.run_records import event_to_domain

logger = logging.getLogger(__name__)

_JSON_OBJECT = TypeAdapter(dict[str, JsonValue])
_JSON_VALUE = TypeAdapter(JsonValue)


class UserQuestionService:
    def __init__(
        self,
        database: Database,
        projections: SQLAlchemyAgentProjectionService,
        tools: ToolRegistryFactory,
    ) -> None:
        self._database, self._projections, self._tools = database, projections, tools

    def _session(self, transaction: Session, session_id: str) -> ReducedSession:
        if transaction.get(SessionRecord, session_id) is None:
            raise QuestionNotFoundError("Session not found.")
        rows = transaction.scalars(
            select(SessionEventRecord)
            .where(SessionEventRecord.session_id == session_id)
            .order_by(SessionEventRecord.sequence)
        ).all()
        return reduce_session(event_to_domain(row) for row in rows)

    def _find(
        self, transaction: Session, question_id: str
    ) -> tuple[ReducedRun, QuestionSnapshot]:
        session_id = transaction.scalar(
            select(SessionEventRecord.session_id).where(
                SessionEventRecord.event_type == "question.requested",
                SessionEventRecord.payload["question_id"].as_string() == question_id,
            )
        )
        if session_id is None:
            raise QuestionNotFoundError("Human question not found.")
        for run in self._session(transaction, session_id).runs:
            for question in run.questions:
                if question.question_id == question_id:
                    return run, QuestionSnapshot(session_id, run.run_id, question)
        raise QuestionNotFoundError("Human question projection not found.")

    def get(self, question_id: str) -> QuestionSnapshot:
        with self._database.sessions() as transaction:
            return self._find(transaction, question_id)[1]

    def list_for_session(self, session_id: str) -> tuple[QuestionSnapshot, ...]:
        with self._database.sessions() as transaction:
            session = self._session(transaction, session_id)
            return tuple(
                QuestionSnapshot(session_id, run.run_id, question)
                for run in session.runs
                for question in run.questions
            )

    def _call(self, run: ReducedRun, tool: ReducedToolCall) -> ToolCall:
        registered = self._tools.for_run(run.run_id).require(tool.name)
        if not registered.spec.interaction or registered.spec.execution != "exclusive":
            raise ToolExecutionError(
                "The tool is not registered for human interaction."
            )
        arguments = _JSON_OBJECT.validate_python(
            dict(registered.validate(tool.arguments))
        )
        return ToolCall(run.run_id, tool.tool_call_id, tool.name, arguments)

    def request(self, run_id: str, tool_call_id: str) -> None:
        with self._database.sessions() as transaction:
            transaction.execute(text("BEGIN IMMEDIATE"))
            record = transaction.get(RunRecord, run_id)
            if record is None:
                raise QuestionNotFoundError("Question run not found.")
            run = next(
                run
                for run in self._session(transaction, record.session_id).runs
                if run.run_id == run_id
            )
            if run.state is RunState.WAITING_INPUT:
                question = next(
                    q for q in run.questions if q.question_id == run.pending_question_id
                )
                if question.tool_call_id == tool_call_id:
                    return
                raise QuestionConflictError("Run already owns a different question.")
            calls = current_tool_batch(run)
            if run.state is not RunState.TOOL_RUNNING or run.next_tool_index >= len(
                calls
            ):
                raise QuestionConflictError(
                    "Question must own the current tool boundary."
                )
            tool = calls[run.next_tool_index]
            if tool.tool_call_id != tool_call_id or tool.status != "pending":
                raise QuestionConflictError("Question must own the exact pending call.")
            remaining = (
                run.budget.max_active_milliseconds - run.budget.active_milliseconds
            )
            if run.budget.tool_calls >= run.budget.max_tool_calls or remaining < 1:
                raise QuestionConflictError("Question tool budget is exhausted.")
            started, now = monotonic_ns(), datetime.now(UTC)
            call = self._call(run, tool)
            request = self._tools.require_question_handler(tool.name, run_id).questions(
                call
            )
            reserved = min(5000, remaining)
            elapsed = min(reserved, max(0, (monotonic_ns() - started) // 1_000_000))
            operation_id = f"op_{uuid4().hex}"
            self._projections.commit_in_transaction(
                transaction,
                EventBatch(
                    run.session_id,
                    run_id,
                    (
                        BudgetReservedEvent(
                            session_id=run.session_id,
                            run_id=run_id,
                            event_type="run.budget_reserved",
                            payload=BudgetReservedPayload(
                                operation_id=operation_id,
                                operation_type="tool",
                                operation_count=1,
                                reserved_milliseconds=reserved,
                            ),
                            occurred_at=now,
                        ),
                        ToolProgressEvent(
                            session_id=run.session_id,
                            run_id=run_id,
                            event_type="tool.started",
                            payload=ToolProgressPayload(
                                tool_call_id=tool.tool_call_id,
                                provider_call_id=tool.provider_call_id,
                                message_id=tool.message_id,
                                batch_index=tool.batch_index,
                                next_tool_index=tool.batch_index,
                            ),
                            occurred_at=now,
                        ),
                        BudgetSettledEvent(
                            session_id=run.session_id,
                            run_id=run_id,
                            event_type="run.budget_settled",
                            payload=BudgetSettledPayload(
                                operation_id=operation_id,
                                operation_type="tool",
                                operation_count=1,
                                reserved_milliseconds=reserved,
                                actual_milliseconds=elapsed,
                                charged_milliseconds=elapsed,
                                crashed=False,
                            ),
                            occurred_at=now,
                        ),
                        QuestionRequestedEvent(
                            session_id=run.session_id,
                            run_id=run_id,
                            event_type="question.requested",
                            payload=QuestionRequestedPayload(
                                question_id=str(uuid4()),
                                tool_call_id=tool_call_id,
                                request=request,
                            ),
                            occurred_at=datetime.now(UTC),
                        ),
                    ),
                ),
            )
            transaction.commit()

    def decide(
        self,
        question_id: str,
        answer: QuestionAnswers | None,
        queue_sequence: int | None,
    ) -> QuestionDecision:
        with self._database.sessions() as transaction:
            transaction.execute(text("BEGIN IMMEDIATE"))
            run, snapshot = self._find(transaction, question_id)
            question = snapshot.question
            decision = "dismissed" if answer is None else "answered"
            if answer is not None:
                answer = answer.for_questions(question.request)
            if question.status != "pending":
                if question.status != decision or question.answer != answer:
                    raise QuestionConflictError(
                        "Question already has a different decision."
                    )
                return QuestionDecision(snapshot, False)
            if (
                run.state is not RunState.WAITING_INPUT
                or run.pending_question_id != question_id
                or queue_sequence is None
            ):
                raise QuestionConflictError("Run no longer owns this pending question.")
            tool = current_tool_batch(run)[run.next_tool_index]
            if tool.tool_call_id != question.tool_call_id:
                raise QuestionConflictError(
                    "Pending question differs from the current tool."
                )
            call = self._call(run, tool)
            handler = self._tools.require_question_handler(tool.name, run.run_id)
            now = datetime.now(UTC)
            result: ToolResult | None = None
            error: ToolExecutionError | None = None
            try:
                result = handler.resolve(call, answer)
                if not isinstance(result, ToolResult):
                    raise TypeError("Question handler returned an invalid tool result.")
                if not isinstance(result.content, tuple) or not isinstance(
                    result.events, tuple
                ):
                    raise TypeError(
                        "Question tool content and events must be immutable tuples."
                    )
                _JSON_VALUE.validate_python(result.result)
                TOOL_CONTENT_ADAPTER.validate_python(result.content)
                for event in result.events:
                    validate_event_draft(event)
                    if event.session_id != run.session_id or event.run_id not in (
                        None,
                        run.run_id,
                    ):
                        raise ValueError(
                            "Question result event crosses its caller scope."
                        )
            except ToolExecutionError as cause:
                logger.info(
                    "Question tool settled with error: run=%s tool=%s code=%s",
                    run.run_id,
                    tool.tool_call_id,
                    cause.code,
                )
                error = cause
            common = {
                "tool_call_id": tool.tool_call_id,
                "provider_call_id": tool.provider_call_id,
                "message_id": tool.message_id,
                "batch_index": tool.batch_index,
            }
            events = [
                QuestionResolvedEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="question.resolved",
                    payload=QuestionResolvedPayload(
                        question_id=question_id, decision=decision, answer=answer
                    ),
                    occurred_at=now,
                ),
            ]
            if error is not None:
                events.append(
                    ToolFailedEvent(
                        session_id=run.session_id,
                        run_id=run.run_id,
                        event_type="tool.failed",
                        payload=ToolFailedPayload(
                            **common,
                            next_tool_index=tool.batch_index + 1,
                            error_code=error.code,
                            error_summary=str(error),
                        ),
                        occurred_at=now,
                    )
                )
            else:
                assert result is not None
                events.extend(result.events)
                events.append(
                    ToolCompletedEvent(
                        session_id=run.session_id,
                        run_id=run.run_id,
                        event_type="tool.completed",
                        payload=ToolCompletedPayload(
                            **common,
                            next_tool_index=tool.batch_index + 1,
                            result=result.result,
                            content=result.content,
                        ),
                        occurred_at=now,
                    )
                )
            events.append(
                RunProgressEvent(
                    session_id=run.session_id,
                    run_id=run.run_id,
                    event_type="run.queued",
                    payload=RunProgressPayload(
                        step=run.step,
                        attempt=run.attempt,
                        resume_phase="tool"
                        if tool.batch_index + 1 < len(current_tool_batch(run))
                        else "model",
                        next_tool_index=tool.batch_index + 1,
                        requires_resume=False,
                        queue_sequence=queue_sequence,
                        reason=None,
                        budget=budget_usage(run),
                    ),
                    occurred_at=now,
                )
            )
            self._projections.commit_in_transaction(
                transaction, EventBatch(run.session_id, None, tuple(events))
            )
            transaction.commit()
        return QuestionDecision(self.get(question_id), True)
