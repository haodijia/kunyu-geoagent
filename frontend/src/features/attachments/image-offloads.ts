import type { TrajectoryEventProjection } from "@/features/events/projection";
import { parseToolContent, toolContentImages } from "@/features/agent/tool-content";
import { parseAttachments, type Attachment } from "./api";

type ImageAttachment = Extract<Attachment, { readonly kind: "image" }>;

/** Resolve durable occurrence indexes using the producing message event, never an attachment-wide flag. */
export function collectImageOffloads(events: readonly TrajectoryEventProjection[]): ReadonlyMap<string, ReadonlySet<string>> {
  const sources = new Map<string, readonly ImageAttachment[]>();
  const selected = new Map<string, Set<number>>();
  const byMessage = new Map<string, Set<string>>();
  function add(sequence: number, value: unknown) {
    if (!record(value) || typeof value.message_id !== "string" || !Array.isArray(value.attachments)) return;
    const images = parseAttachments(value.attachments).filter((ref): ref is ImageAttachment => ref.kind === "image");
    sources.set(`${sequence}\n${value.message_id}`, images);
  }
  for (const event of events) {
    if (event.eventType === "message.user.appended") add(event.sequence, event.payload);
    if (event.eventType === "agent/step/decision" && event.payload.kind === "enter") {
      if (!Array.isArray(event.payload.messages)) throw new Error("Invalid image message sources.");
      for (const message of event.payload.messages) add(event.sequence, message);
    }
    if (event.eventType === "tool.completed") {
      if (typeof event.payload.tool_call_id !== "string") throw new Error("Tool image source has no identity.");
      sources.set(`${event.sequence}\n${event.payload.tool_call_id}`, toolContentImages(parseToolContent(event.payload.content)));
    }
    if (event.eventType !== "image/offload") continue;
    if (!Array.isArray(event.payload.targets) || event.payload.targets.length === 0) throw new Error("Invalid image offload targets.");
    for (const target of event.payload.targets) {
      if (!record(target) || !Number.isSafeInteger(target.sequence) || (target.sequence as number) < 1
        || typeof target.message_id !== "string" || !Array.isArray(target.image_indexes) || target.image_indexes.length === 0)
        throw new Error("Invalid image offload source.");
      const key = `${target.sequence}\n${target.message_id}`;
      const images = sources.get(key);
      if (images === undefined) throw new Error("Image offload source is missing.");
      const indexes = selected.get(key) ?? new Set<number>();
      const ids = byMessage.get(target.message_id) ?? new Set<string>();
      let previous = -1;
      for (const index of target.image_indexes) {
        if (typeof index !== "number" || !Number.isSafeInteger(index) || index <= previous || index >= images.length || indexes.has(index))
          throw new Error("Invalid or repeated image offload occurrence.");
        indexes.add(index); ids.add(images[index]!.id); previous = index;
      }
      selected.set(key, indexes); byMessage.set(target.message_id, ids);
    }
  }
  return byMessage;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
