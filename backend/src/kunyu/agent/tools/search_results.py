"""Harness search parsing, retention, grouping and bounded presentation metadata.

Sampling and rendering ported from DeepSeek harness (copyright 2026 DeepSeek).
MIT license is packaged alongside this module and in licenses/DeepSeek-LICENSE.txt.
"""

import json
import posixpath
from collections import OrderedDict

from kunyu.agent.runtime.tools import ToolExecutionError

META_MAX_BYTES = 65_536
MAX_PATHS = 100
MAX_MATCHES = 250
MAX_LINE_BYTES = 2000
Match = tuple[str, int, str]


def display_path(path: str) -> str:
    normalized = posixpath.normpath(path)
    if normalized == ".." or normalized.startswith(("../", "/")):
        raise ToolExecutionError(
            "Search returned an out-of-scope path.", code="SEARCH_FAILED"
        )
    return normalized


def parse_matches(output: str) -> list[Match]:
    matches = []
    try:
        for line in output.splitlines():
            value = json.loads(line)
            if not isinstance(value, dict):
                raise TypeError("expected a JSON object")
            if value.get("type") != "match":
                continue
            data = value["data"]
            path, number, lines = (
                data["path"]["text"],
                data["line_number"],
                data["lines"],
            )
            if (
                not isinstance(path, str)
                or type(number) is not int
                or number <= 0
                or not isinstance(lines, dict)
            ):
                raise ValueError("invalid match record")
            if isinstance(lines.get("text"), str):
                text = lines["text"]
                if text.endswith("\n"):
                    text = text[:-1]
                    text = text.removesuffix("\r")
            elif isinstance(lines.get("bytes"), str):
                text = "(line is not valid UTF-8)"
            else:
                raise TypeError("match has no line text")
            matches.append((display_path(path), number, preview_line(text)))
    except (ValueError, KeyError, TypeError) as error:
        raise ToolExecutionError(
            "grep returned malformed JSON output.", code="SEARCH_FAILED"
        ) from error
    return matches


def preview_line(line: str) -> str:
    data = line.encode("utf-8")
    if len(data) <= MAX_LINE_BYTES:
        return line
    cut = MAX_LINE_BYTES
    while data[cut] & 0xC0 == 0x80:
        cut -= 1
    return data[:cut].decode("utf-8") + " (line truncated)"


def sample_paths(paths: list[str], root: str) -> tuple[list[str], int, int]:
    groups: dict[str, list[str]] = OrderedDict()
    for path in paths:
        relative = (
            path[len(root) + 1 :]
            if root != "." and path.startswith(root + "/")
            else path
        )
        groups.setdefault(relative.split("/")[0], []).append(path)
    taken: dict[str, list[str]] = OrderedDict()
    active = list(groups.items())
    index, count = 0, 0
    while active and count < MAX_PATHS:
        next_active = []
        for key, values in active:
            if count == MAX_PATHS:
                break
            taken.setdefault(key, []).append(values[index])
            count += 1
            if index + 1 < len(values):
                next_active.append((key, values))
        active = next_active
        index += 1
    return (
        [path for values in taken.values() for path in values],
        len(taken),
        len(groups),
    )


def grouped_matches(matches: list[Match]) -> list[dict]:
    files: dict[str, list[dict]] = OrderedDict()
    for path, number, line in matches:
        files.setdefault(path, []).append({"lineNumber": number, "line": line})
    return [{"path": path, "matches": lines} for path, lines in files.items()]


def format_matches(matches: list[Match]) -> str:
    return "\n\n".join(
        file["path"]
        + "\n"
        + "\n".join(
            f"Line {match['lineNumber']}: {match['line']}" for match in file["matches"]
        )
        for file in grouped_matches(matches)
    )


def cap_metadata(metadata: dict) -> dict:
    items = metadata["paths" if metadata["shape"] == "paths" else "files"]
    while (
        len(items) > 1
        and len(
            json.dumps(metadata, ensure_ascii=False, separators=(",", ":")).encode(
                "utf-8"
            )
        )
        > META_MAX_BYTES
    ):
        items.pop()
        metadata["truncated"] = True
    return metadata
