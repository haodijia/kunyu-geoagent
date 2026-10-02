import type { TrajectoryEventProjection } from "@/features/events/projection";

export function pendingInboxMessages(records: readonly TrajectoryEventProjection[], target: "next-step" | "next-turn"): ReadonlySet<string> {
  const pending: string[] = [];
  for (const record of records) {
    if (target === "next-turn" && record.eventType === "agent/queue/reordered") {
      const ids = record.payload.message_ids;
      if (!Array.isArray(ids) || ids.some((id: unknown) => typeof id !== "string") || ids.length !== pending.length || new Set(ids).size !== pending.length || ids.some((id: string) => !pending.includes(id))) {
        throw new Error("Invalid pending input order.");
      }
      pending.splice(0, pending.length, ...ids);
      continue;
    }
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

export function inboxQueueMode(records: readonly TrajectoryEventProjection[]): "auto" | "manual" {
  let mode: "auto" | "manual" = "auto";
  for (const record of records) {
    if (record.eventType !== "agent/queue/mode") continue;
    const next = record.payload.mode;
    if (next !== "auto" && next !== "manual") throw new Error("Invalid queue mode.");
    mode = next;
  }
  return mode;
}
