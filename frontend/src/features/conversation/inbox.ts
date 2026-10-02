import type { TrajectoryEventProjection } from "@/features/events/projection";

export function pendingSteeringMessages(records: readonly TrajectoryEventProjection[]): ReadonlySet<string> {
  const pending: string[] = [];
  for (const record of records) {
    if (record.eventType !== "agent/inbox/spliced") continue;
    const { start, delete_count: count, messages } = record.payload;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || !Array.isArray(messages)) {
      throw new Error("Invalid inbox splice.");
    }
    const inserted = messages.map((message: unknown) => {
      if (message === null || typeof message !== "object" || !("message_id" in message) || typeof message.message_id !== "string") {
        throw new Error("Inbox messages require an identity.");
      }
      return message.message_id;
    });
    pending.splice(start as number, count as number, ...inserted);
  }
  return new Set(pending);
}
