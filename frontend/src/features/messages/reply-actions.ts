// Adapted from Mu's turnCopy.ts and formatMessageTime (Apache-2.0).
import type { PresentedBlock } from "@/features/events/stream-presentation";
import type { SessionMessage } from "./api";

/** Visible user messages bound replies; tools, reasoning and commands do not. */
export function collectReplyCopyRows(
  messages: readonly SessionMessage[],
  blocks: ReadonlyMap<string, readonly PresentedBlock[]>,
  processing: boolean,
): ReadonlyMap<string, string> {
  const rows = new Map<string, string>();
  let lastTextId: string | null = null;
  let text: string[] = [];
  const finish = () => {
    if (lastTextId !== null) rows.set(lastTextId, text.join("\n\n"));
    lastTextId = null;
    text = [];
  };
  for (const message of messages) {
    if (message.role === "user") {
      finish();
      continue;
    }
    const content = blocks.get(message.id);
    if (content === undefined) continue;
    const segments = content.flatMap((block) =>
      block.type === "text" && block.text.trim().length > 0 ? [block.text.trim()] : [],
    );
    if (segments.length > 0) {
      lastTextId = message.id;
      text.push(...segments);
    }
  }
  if (!processing) finish();
  return rows;
}

export function formatMessageTime(timestamp: string, now = new Date(), locale = "zh-CN"): string {
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === now.getFullYear();
  const today = sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return new Intl.DateTimeFormat(locale, {
    ...(today ? {} : { ...(sameYear ? {} : { year: "numeric" }), month: "2-digit", day: "2-digit" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
