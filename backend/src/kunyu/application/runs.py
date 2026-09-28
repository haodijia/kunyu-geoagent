from collections.abc import Callable
from dataclasses import dataclass
from time import monotonic

DELTA_FLUSH_INTERVAL_SECONDS = 0.05
DELTA_FLUSH_CODEPOINTS = 1_024


@dataclass(frozen=True, slots=True)
class AssistantDeltaBatch:
    offset: int
    text: str

    @property
    def content_length(self) -> int:
        return len(self.text)


class AssistantDeltaBuffer:
    """Collect model text until the time or Unicode-codepoint bound is reached."""

    def __init__(
        self,
        offset: int,
        *,
        clock: Callable[[], float] | None = None,
    ) -> None:
        if offset < 0:
            raise ValueError("Assistant delta offset must be non-negative.")
        self._offset = offset
        self._clock = clock or monotonic
        self._parts: list[str] = []
        self._codepoints = 0
        self._started_at: float | None = None

    @property
    def pending_codepoints(self) -> int:
        return self._codepoints

    def add(self, text: str) -> AssistantDeltaBatch | None:
        if not text:
            return None
        if self._started_at is None:
            self._started_at = self._clock()
        self._parts.append(text)
        self._codepoints += len(text)
        if self._codepoints >= DELTA_FLUSH_CODEPOINTS:
            return self.flush()
        return None

    def flush_if_due(self) -> AssistantDeltaBatch | None:
        if self._started_at is None:
            return None
        if self._clock() - self._started_at < DELTA_FLUSH_INTERVAL_SECONDS:
            return None
        return self.flush()

    def flush(self) -> AssistantDeltaBatch | None:
        if not self._parts:
            return None
        batch = AssistantDeltaBatch(offset=self._offset, text="".join(self._parts))
        self._offset += batch.content_length
        self._parts.clear()
        self._codepoints = 0
        self._started_at = None
        return batch
