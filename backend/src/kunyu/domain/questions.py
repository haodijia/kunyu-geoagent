"""Durable human-question snapshots and decision errors."""

from dataclasses import dataclass

from kunyu.agent.runtime.run_state import ReducedQuestion


class QuestionNotFoundError(LookupError):
    pass


class QuestionConflictError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class QuestionSnapshot:
    session_id: str
    run_id: str
    question: ReducedQuestion


@dataclass(frozen=True, slots=True)
class QuestionDecision:
    question: QuestionSnapshot
    continuation_required: bool
