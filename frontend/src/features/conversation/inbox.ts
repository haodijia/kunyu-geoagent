import type { TrajectoryEventProjection } from "@/features/events/projection";

export function pendingInboxMessages(records: readonly TrajectoryEventProjection[], target: "next-step" | "next-turn"): ReadonlySet<string> {
  const pending: string[] = [];
  for (const record of records) {
    if (record.eventType !== "agent/inbox/spliced") continue;
    if (record.payload.target !== target) continue;
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
    const offset = start as number;
    const deleted = count as number;
    if (offset < 0 || deleted < 0 || offset + deleted > pending.length) throw new Error("Invalid inbox splice boundary.");
    pending.splice(offset, deleted, ...inserted);
  }
  return new Set(pending);
}
