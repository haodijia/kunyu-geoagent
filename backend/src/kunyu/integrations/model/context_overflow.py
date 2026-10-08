"""Normalize explicit provider context overflow without retaining error bodies."""

# Adapted from deepseek-harness (MIT); see tools/DeepSeek-LICENSE.txt.

import re

_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"(?:^|[^a-z0-9])context[\s_-](?:length|window)[\s_-](?:exceed(?:ed|s)?|overflow(?:ed)?|limit[\s_-]exceeded)(?:$|[^a-z0-9])",
        r"\b(?:maximum|max)(?:\s+(?:allowed|supported))?\s+context\s+(?:length|window)\b",
        r"\b(?:request|prompt|input|messages?)\s+(?:is\s+|are\s+)?too\s+(?:large|long)\s+for\s+(?:(?:this|the)\s+)?(?:model(?:'s)?\s+)?context(?:\s+window)?\b",
        r"\b(?:input|prompt|request)\s+(?:is\s+)?too\s+(?:long|large)\s+for\s+(?:this|the)\s+model\b",
        r"\b(?:input|prompt|request|messages?)\b.{0,40}\b(?:exceed(?:s|ed)?|overflows?|is\s+larger\s+than)\b.{0,40}\b(?:the\s+)?(?:model(?:'s)?\s+)?context(?:\s+(?:length|window))?\b",
    )
)


def is_context_overflow(detail: object) -> bool:
    if isinstance(detail, dict):
        fields = [
            detail[key]
            for key in ("code", "type", "message")
            if isinstance(detail.get(key), str)
        ]
        if isinstance(detail.get("error"), dict):
            return is_context_overflow(detail["error"])
        text = " ".join(fields)
    elif isinstance(detail, str):
        text = detail
    else:
        return False
    return any(pattern.search(text[:8192]) is not None for pattern in _PATTERNS)
