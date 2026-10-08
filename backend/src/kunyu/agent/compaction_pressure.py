"""Price the latest routed envelope against harness pressure policy."""

# Adapted from deepseek-harness (MIT); see tools/DeepSeek-LICENSE.txt.

import json
import math
from collections.abc import Sequence
from dataclasses import dataclass

from kunyu.agent.runtime.events import CompactionPressurePayload, ModelSnapshotPayload
from kunyu.agent.runtime.models import ModelMessage
from kunyu.agent.token_estimate import estimate_messages, text_tokens


class PressureConfigurationError(ValueError):
    def __init__(self, snapshot: ModelSnapshotPayload, message: str) -> None:
        self.target = (
            snapshot.connection_id,
            snapshot.model_id,
            snapshot.connection_revision,
        )
        super().__init__(message)


@dataclass(frozen=True, slots=True)
class PressurePolicy:
    threshold_ratio: float = 0.8
    headroom_tokens: int = 65536

    def __post_init__(self) -> None:
        if not math.isfinite(self.threshold_ratio) or not 0 < self.threshold_ratio <= 1:
            raise ValueError("Compaction threshold ratio must be in (0, 1].")
        if type(self.headroom_tokens) is not int or self.headroom_tokens < 0:
            raise ValueError("Compaction headroom must be a nonnegative integer.")


def measure_pressure(
    messages: tuple[ModelMessage, ...],
    tools: Sequence[dict],
    snapshot: ModelSnapshotPayload,
    policy: PressurePolicy,
) -> CompactionPressurePayload:
    window = snapshot.context_window
    if window is None:
        raise PressureConfigurationError(
            snapshot, "模型未声明上下文窗口，无法自动判断压缩压力。"
        )
    threshold = math.floor(
        min(
            window * policy.threshold_ratio,
            window - snapshot.max_output_tokens - policy.headroom_tokens,
        )
    )
    if threshold <= snapshot.retention_tokens:
        raise PressureConfigurationError(
            snapshot, "压缩阈值须大于保留预算；请增大模型窗口或减小输出／压缩预留。"
        )
    schema_tokens = sum(
        text_tokens(
            json.dumps(
                {key: tool[key] for key in ("name", "description", "parameters")},
                ensure_ascii=False,
                separators=(",", ":"),
            )
        )
        for tool in tools
    )
    return CompactionPressurePayload(
        estimated_prompt_tokens=estimate_messages(messages) + schema_tokens,
        estimated_tool_tokens=schema_tokens,
        threshold_tokens=threshold,
        threshold_ratio=policy.threshold_ratio,
        headroom_tokens=policy.headroom_tokens,
    )
