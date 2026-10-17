"""Human questions and answers shared by tools, journal and client API."""

import json
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class QuestionValue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class QuestionOption(QuestionValue):
    label: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class QuestionInput(QuestionValue):
    id: str = Field(min_length=1, max_length=64)
    question: str = Field(min_length=1, max_length=4000)
    header: str | None = Field(default=None, max_length=200)
    options: tuple[QuestionOption, ...] = Field(default=(), max_length=20)
    multi_select: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def unique_options(self) -> Self:
        if not self.id.strip() or not self.question.strip():
            raise ValueError("Question identity and text cannot be blank.")
        labels = [option.label for option in self.options]
        if any(not label.strip() for label in labels) or len(set(labels)) != len(
            labels
        ):
            raise ValueError("Option labels must be nonblank and unique.")
        return self


class PlanReviewIntent(QuestionValue):
    kind: Literal["plan-review"] = "plan-review"
    approve: str
    call_id: str | None = None


class Question(QuestionInput):
    detail: str | None = Field(default=None, max_length=32768)
    intent: PlanReviewIntent | None = None

    @model_validator(mode="after")
    def valid_intent(self) -> Self:
        if self.intent is not None and (
            self.detail is None
            or self.intent.approve not in {option.label for option in self.options}
        ):
            raise ValueError("Plan review requires detail and its own approval option.")
        return self


type QuestionItems = Annotated[tuple[Question, ...], Field(min_length=1, max_length=10)]


class QuestionSet(QuestionValue):
    questions: QuestionItems

    @model_validator(mode="after")
    def unique_questions(self) -> Self:
        if len({question.id for question in self.questions}) != len(self.questions):
            raise ValueError("Question identities must be unique.")
        return self


class QuestionAnswer(QuestionValue):
    id: str = Field(min_length=1, max_length=64)
    selected: tuple[str, ...] = Field(max_length=20)
    custom: str | None = Field(default=None, max_length=32768)


class QuestionAnswers(QuestionValue):
    answers: tuple[QuestionAnswer, ...] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def bounded_answer(self) -> Self:
        encoded = json.dumps(
            self.model_dump(mode="json", exclude_none=True),
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        if len(encoded) > 16384:
            raise ValueError(
                "The complete answer exceeds the 16 KiB tool-result limit."
            )
        return self

    def for_questions(self, questions: QuestionSet) -> "QuestionAnswers":
        by_id = {answer.id: answer for answer in self.answers}
        if len(by_id) != len(self.answers) or set(by_id) != {
            q.id for q in questions.questions
        }:
            raise ValueError(
                "Answers must match every requested question exactly once."
            )
        normalized = []
        for question in questions.questions:
            answer = by_id[question.id]
            selected = set(answer.selected)
            labels = [option.label for option in question.options]
            custom = answer.custom.strip() if answer.custom is not None else None
            if not custom:
                custom = None
            if len(selected) != len(answer.selected) or not selected.issubset(labels):
                raise ValueError("Selected labels must be unique offered options.")
            if not question.multi_select and (
                len(selected) > 1 or (selected and custom is not None)
            ):
                raise ValueError(
                    "Single-select answers allow one option or custom text."
                )
            normalized.append(
                QuestionAnswer(
                    id=question.id,
                    selected=tuple(label for label in labels if label in selected),
                    custom=custom,
                )
            )
        return QuestionAnswers(answers=tuple(normalized))
