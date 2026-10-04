"""Harness line windows and read envelopes, independent of filesystem providers."""

from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import PurePosixPath

from kunyu.domain.filesystem import FilesystemError

READ_LIMIT = 2000
READ_MAX_LINE_LENGTH = 2000
READ_MAX_BYTES = 50 * 1024


@dataclass(frozen=True, slots=True)
class FileTextLine:
    number: int
    text: str


@dataclass(frozen=True, slots=True)
class ReadWindow:
    offset: int
    lines: tuple[FileTextLine, ...]
    total_lines: int
    truncated_by_bytes: bool


def build_window(
    chunks: Iterable[str], offset: int, limit: int, display_path: str
) -> ReadWindow:
    lines = []
    total = output_bytes = 0
    capped = False
    buffer = bytearray()
    # The harness counts UTF-16 code units. One extra unit proves truncation;
    # UTF-8 materialization replaces a cut surrogate just as Buffer.byteLength does.
    buffer_cap = (READ_MAX_LINE_LENGTH + 1) * 2

    def append(segment: str) -> None:
        if len(buffer) < buffer_cap:
            buffer.extend(segment.encode("utf-16-le")[: buffer_cap - len(buffer)])

    def flush() -> None:
        nonlocal total, output_bytes, capped
        total += 1
        if buffer.endswith(b"\r\x00"):
            del buffer[-2:]
        if not capped and total >= offset and len(lines) < limit:
            text = bytes(buffer[: READ_MAX_LINE_LENGTH * 2]).decode(
                "utf-16-le", errors="replace"
            )
            if len(buffer) > READ_MAX_LINE_LENGTH * 2:
                text += f"... (line truncated to {READ_MAX_LINE_LENGTH} chars)"
            count = len(text.encode("utf-8")) + (1 if lines else 0)
            if output_bytes + count > READ_MAX_BYTES:
                capped = True
            else:
                output_bytes += count
                lines.append(FileTextLine(total, text))
        buffer.clear()

    for chunk in chunks:
        segments = chunk.split("\n")
        for segment in segments[:-1]:
            append(segment)
            flush()
        append(segments[-1])
    if buffer:
        flush()
    if not capped and offset > total and not (total == 0 and offset == 1):
        raise FilesystemError(
            "FS_NOT_FOUND",
            f'offset {offset} is out of range for "{display_path}" ({total} lines)',
        )
    return ReadWindow(offset, tuple(lines), total, capped)


def format_read_output(path: str, window: ReadWindow) -> str:
    end = window.lines[-1].number if window.lines else max(0, window.offset - 1)
    if window.truncated_by_bytes:
        footer = f"(Output capped. Showing lines {window.offset}-{end}. Use offset={end + 1} to continue.)"
    elif end < window.total_lines:
        footer = f"(Showing lines {window.offset}-{end} of {window.total_lines}. Use offset={end + 1} to continue.)"
    else:
        footer = f"(End of file - total {window.total_lines} lines)"
    body = "\n".join(f"{line.number}: {line.text}" for line in window.lines)
    if window.lines:
        body += "\n\n"
    return (
        f"<path>{path}</path>\n<type>file</type>\n<content>\n{body}{footer}\n</content>"
    )


_LANGUAGES = {
    "ts": "ts",
    "tsx": "tsx",
    "mts": "ts",
    "cts": "ts",
    "js": "js",
    "jsx": "jsx",
    "mjs": "js",
    "cjs": "js",
    "json": "json",
    "jsonc": "json",
    "py": "py",
    "rb": "rb",
    "go": "go",
    "rs": "rs",
    "java": "java",
    "c": "c",
    "h": "c",
    "cc": "cpp",
    "cpp": "cpp",
    "hpp": "cpp",
    "cxx": "cpp",
    "cs": "cs",
    "kt": "kotlin",
    "swift": "swift",
    "php": "php",
    "sh": "sh",
    "bash": "sh",
    "zsh": "sh",
    "yaml": "yaml",
    "yml": "yaml",
    "toml": "toml",
    "ini": "ini",
    "md": "md",
    "markdown": "md",
    "mdx": "mdx",
    "html": "html",
    "htm": "html",
    "css": "css",
    "scss": "scss",
    "less": "less",
    "sql": "sql",
    "xml": "xml",
    "lua": "lua",
}


def lang_from_path(path: str) -> str | None:
    return _LANGUAGES.get(PurePosixPath(path).suffix.removeprefix(".").lower())
