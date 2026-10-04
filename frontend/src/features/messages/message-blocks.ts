import { parseAssistantStream } from "@/features/events/assistant-stream";
import { parseContentBlocks } from "@/features/events/content-blocks";
import type { TrajectoryEventProjection } from "@/features/events/projection";
import {
  streamPresentation,
  type PresentedBlock,
} from "@/features/events/stream-presentation";

export function collectMessageBlocks(
  records: readonly TrajectoryEventProjection[],
) {
  const result = new Map<string, readonly PresentedBlock[]>();
  for (const record of records) {
    if (
      record.eventType !== "model.attempt.finished" ||
      record.messageId === null
    )
      continue;
    const observed = streamPresentation(
      parseAssistantStream(record.payload.stream),
      Number.MAX_SAFE_INTEGER,
    ).blocks;
    const interrupted =
      !["stop", "tool_calls", "length"].includes(
        String(record.payload.outcome),
      ) || record.payload.error_code === "OUTPUT_LIMIT";
    const thoughts = observed.filter(
      (block): block is Extract<PresentedBlock, { type: "reasoning" }> =>
        block.type === "reasoning" &&
        (!interrupted || block.text.trim() !== ""),
    );
    let thoughtIndex = 0;
    result.set(
      record.messageId,
      parseContentBlocks(record.payload.blocks).map(
        (block, index): PresentedBlock => {
          if (block.type === "tool-call") return { ...block, index };
          const timing =
            block.type === "reasoning" ? thoughts[thoughtIndex++] : undefined;
          return {
            ...block,
            index,
            startedAt: timing?.startedAt ?? null,
            finishedAt: timing?.finishedAt ?? record.occurredAt,
          };
        },
      ),
    );
  }
  return result;
}
