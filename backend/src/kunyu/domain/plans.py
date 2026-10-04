"""Immutable plan documents submitted through model tool calls."""

import re
from dataclasses import dataclass


def plan_title(markdown: str) -> str:
    match = re.match(r"^#\s+(\S[^\r\n]*)", markdown.strip())
    if match is None:
        raise ValueError("A complete Markdown plan must start with a # heading.")
    return match.group(1).strip()


@dataclass(frozen=True, slots=True)
class SubmittedPlan:
    tool_call_id: str
    title: str
    markdown: str
