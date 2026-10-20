"""Readable portable names with numeric collision suffixes."""

import re
from pathlib import PurePosixPath


def readable_name(value: str) -> str:
    name = re.sub(r'[\x00-\x1f\x7f<>:"/\\|?*]', "", value).strip().rstrip(". ")
    while len(name.encode("utf-8")) > 255:
        name = name[:-1]
    if not name or name in {".", ".."}:
        raise ValueError("A resource name must contain a filename.")
    return name


def numbered_name(name: str, index: int) -> str:
    if index == 1:
        return name
    original = PurePosixPath(name)
    stem, suffix = original.stem, f"-{index}{original.suffix}"
    if len(suffix.encode("utf-8")) >= 255:
        raise ValueError("Filename extension leaves no room for a numeric suffix.")
    while len((stem + suffix).encode("utf-8")) > 255:
        stem = stem[:-1]
    return stem + suffix
