"""Select a priced old prefix while retaining complete recent history nodes."""

from dataclasses import dataclass

from kunyu.agent.context import ModelHistoryNode
from kunyu.agent.token_estimate import estimate_messages


@dataclass(frozen=True, slots=True)
class CompactionSelection:
    selected: tuple[ModelHistoryNode, ...]
    retained: tuple[ModelHistoryNode, ...]
    estimated_tokens: int


def select_prefix(
    nodes: tuple[ModelHistoryNode, ...], retention_tokens: int
) -> CompactionSelection | None:
    keep_from = len(nodes)
    accumulated = 0
    if retention_tokens:
        for index in range(len(nodes) - 1, -1, -1):
            accumulated += estimate_messages(nodes[index].messages)
            keep_from = index
            if accumulated >= retention_tokens:
                break
    if keep_from == 0:
        return None
    selected, retained = nodes[:keep_from], nodes[keep_from:]
    if not selected:
        return None
    return CompactionSelection(
        selected, retained, sum(estimate_messages(node.messages) for node in selected)
    )
