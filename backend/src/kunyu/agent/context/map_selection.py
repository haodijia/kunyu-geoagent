"""Render the explicit geometry snapshot belonging to one user question."""

import json

from kunyu.agent.prompts.loader import prompt_text
from kunyu.domain.geospatial.map_context import TurnMapContext


def selection_question(content: str, map_context: dict | None) -> str:
    if map_context is None or map_context.get("selection") is None:
        return content
    selection = TurnMapContext.model_validate(map_context).selection
    context = prompt_text(
        "context.yaml",
        "map_selection",
        selection=json.dumps(selection.model_dump(mode="json"), ensure_ascii=False),
    )
    return f"{context}\n\n{content}"
