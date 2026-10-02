import type { TrajectoryEventProjection } from "@/features/events/projection";
import {
  parseAssistantStream,
  parseStreamOrigin,
  streamReasoning,
} from "@/features/events/assistant-stream";

export interface MessageReasoning {
  readonly text: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

// Reasoning and its timing come from the same durable events used by the trajectory.
export function collectMessageReasoning(
  records: readonly TrajectoryEventProjection[],
) {
  const thoughts = new Map<string, MessageReasoning>();
  for (const record of records) {
    if (record.messageId === null) continue;
    const thought = thoughts.get(record.messageId);
    if (record.eventType === "model.attempt.finished") {
      parseStreamOrigin(record.payload.stream_origin);
      const settled = streamReasoning(
        parseAssistantStream(record.payload.stream),
        record.occurredAt,
      );
      if (settled !== null) {
        if (record.payload.error_code === "OUTPUT_LIMIT") {
          if (thought !== undefined)
            thoughts.set(record.messageId, { ...settled, text: thought.text });
        } else thoughts.set(record.messageId, settled);
      }
    } else if (record.eventType === "message.assistant.reasoning.delta") {
      const text = record.payload.text;
      if (typeof text !== "string")
        throw new Error("Reasoning delta must contain text.");
      thoughts.set(record.messageId, {
        text: (thought?.text ?? "") + text,
        startedAt: thought?.startedAt ?? record.occurredAt,
        finishedAt: thought?.finishedAt ?? null,
      });
    } else if (
      thought !== undefined &&
      thought.finishedAt === null &&
      [
        "message.assistant.delta",
        "message.assistant.completed",
        "model.attempt.finished",
      ].includes(record.eventType)
    ) {
      thoughts.set(record.messageId, {
        ...thought,
        finishedAt: record.occurredAt,
      });
    }
  }
  return thoughts;
}
