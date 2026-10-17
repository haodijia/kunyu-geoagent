"""Whole-list task snapshots shared by tool input and durable events."""

from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    StringConstraints,
    TypeAdapter,
)


class TodoItem(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
    status: Literal["pending", "in_progress", "completed"]


def validate_todos(items: list[TodoItem]) -> list[TodoItem]:
    if len({item.content for item in items}) != len(items):
        raise ValueError("Todo content must be unique.")
    if sum(item.status == "in_progress" for item in items) > 1:
        raise ValueError("Sequential work permits at most one active todo.")
    return items


type TodoList = Annotated[list[TodoItem], AfterValidator(validate_todos)]

TODO_LIST_ADAPTER = TypeAdapter(TodoList)
