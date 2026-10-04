"""Three-line-context hunks matching jsdiff 9's line Myers path and tie breaking.

Ported from jsdiff; copyright Kevin Decker. BSD-3-Clause license in
licenses/jsdiff-LICENSE.txt and packaged alongside this module.
"""

import re
from dataclasses import dataclass
from threading import Event

from kunyu.domain.filesystem import FilesystemError


def check_cancelled(cancelled: Event, verb: str) -> None:
    if cancelled.is_set():
        raise FilesystemError("FS_ABORTED", f"{verb} aborted")


@dataclass(frozen=True, slots=True)
class _Component:
    count: int
    kind: str
    previous: "_Component | None"


def _tokens(text: str) -> list[str]:
    # Python splitlines also recognizes Unicode separators; jsdiff only splits LF/CRLF.
    return re.findall(r"[^\n]*\n|[^\n]+$", text)


def _changes(before: str, after: str, cancelled: Event) -> list[tuple[str, list[str]]]:
    old, new = _tokens(before), _tokens(after)

    def common(position: int, component: _Component | None, diagonal: int):
        new_position, count = position - diagonal, 0
        while (
            new_position + 1 < len(new)
            and position + 1 < len(old)
            and old[position + 1] == new[new_position + 1]
        ):
            new_position += 1
            position += 1
            count += 1
            if count % 1024 == 0:
                check_cancelled(cancelled, "diff")
        return (
            position,
            _Component(count, " ", component) if count else component,
            new_position,
        )

    position, component, new_position = common(-1, None, 0)
    paths: dict[int, tuple[int, _Component | None]] = {0: (position, component)}
    minimum, maximum = -(len(old) + len(new)), len(old) + len(new)
    complete = position + 1 >= len(old) and new_position + 1 >= len(new)
    for length in range(1, len(old) + len(new) + 1):
        if complete:
            break
        check_cancelled(cancelled, "diff")
        for diagonal in range(max(minimum, -length), min(maximum, length) + 1, 2):
            if diagonal % 128 in {0, 1}:
                check_cancelled(cancelled, "diff")
            remove = paths.pop(diagonal - 1, None)
            add = paths.get(diagonal + 1)
            can_add = add is not None and 0 <= add[0] - diagonal < len(new)
            can_remove = remove is not None and remove[0] + 1 < len(old)
            if not can_add and not can_remove:
                paths.pop(diagonal, None)
                continue
            if not can_remove or (can_add and remove[0] < add[0]):
                assert add is not None
                position, component = add
                kind = "+"
            else:
                assert remove is not None
                position, component = remove
                position += 1
                kind = "-"
            component = (
                _Component(component.count + 1, kind, component.previous)
                if component is not None and component.kind == kind
                else _Component(1, kind, component)
            )
            position, component, new_position = common(position, component, diagonal)
            complete = position + 1 >= len(old) and new_position + 1 >= len(new)
            if complete:
                break
            paths[diagonal] = position, component
            if position + 1 >= len(old):
                maximum = min(maximum, diagonal - 1)
            if new_position + 1 >= len(new):
                minimum = max(minimum, diagonal + 1)
    components = []
    while component is not None:
        components.append(component)
        component = component.previous
    changes = []
    old_position = new_position = 0
    for component in reversed(components):
        tokens = (
            old[old_position : old_position + component.count]
            if component.kind == "-"
            else new[new_position : new_position + component.count]
        )
        changes.append((component.kind, tokens))
        if component.kind != "-":
            new_position += component.count
        if component.kind != "+":
            old_position += component.count
    return changes


def compute_hunk_diffs(
    path: str, before: str, after: str, cancelled: Event
) -> list[dict[str, str | None]]:
    changes = _changes(before, after, cancelled) + [(" ", [])]
    hunks: list[list[tuple[str, str]]] = []
    current: list[tuple[str, str]] | None = None
    for index, (kind, lines) in enumerate(changes):
        check_cancelled(cancelled, "diff")
        if kind != " ":
            if current is None:
                previous = changes[index - 1][1] if index else []
                current = [(" ", line) for line in previous[-3:]]
            current.extend((kind, line) for line in lines)
        elif current is not None:
            if len(lines) <= 6 and index < len(changes) - 2:
                current.extend((" ", line) for line in lines)
            else:
                current.extend((" ", line) for line in lines[:3])
                hunks.append(current)
                current = None
    result = []
    for hunk in hunks:
        old_lines = [line.removesuffix("\n") for kind, line in hunk if kind != "+"]
        new_lines = [line.removesuffix("\n") for kind, line in hunk if kind != "-"]
        result.append(
            {
                "path": path,
                "old_text": "\n".join(old_lines) if old_lines else None,
                "new_text": "\n".join(new_lines),
            }
        )
    return result
