/** Conversation turn previews adapted from Mu (Apache-2.0). */
import type { SessionMessage } from "@/features/messages/api";

export interface MessageAnchor {
  readonly index: number;
  readonly messageId: string;
  readonly question: string;
  readonly answer: string;
}

export function buildMessageAnchors(messages: readonly SessionMessage[]): readonly MessageAnchor[] {
  const anchors: MessageAnchor[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      if (message.run_id === null) continue;
      const text = message.content.trim().length > 0 ? message.content : message.attachments.map((file) => file.name).join(" · ");
      if (text.trim().length > 0) anchors.push({ index: anchors.length + 1, messageId: message.id, question: normalize(text), answer: "" });
    } else if (anchors.length > 0 && message.content.trim().length > 0) {
      const current = anchors.at(-1)!;
      if (current.answer === "") anchors[anchors.length - 1] = { ...current, answer: normalize(message.content) };
    }
  }
  return anchors;
}

export function normalize(text: string): string { return text.replace(/\s+/g, " ").trim(); }
export function truncate(text: string, length = 120): string {
  const characters = Array.from(text);
  return characters.length <= length ? text : characters.slice(0, length).join("") + "…";
}

export function matchesAnchor(anchor: MessageAnchor, query: string): boolean {
  const value = normalize(query).toLowerCase();
  const chinese = chineseIndex(anchor.index);
  return value === "" || anchor.question.toLowerCase().includes(value) || anchor.answer.toLowerCase().includes(value) || [`${anchor.index}`, `#${anchor.index}`, `第${anchor.index}`, chinese, `第${chinese}`].some((index) => index.includes(value));
}

function chineseIndex(index: number): string {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (index < 10) return digits[index]!;
  if (index < 20) return index === 10 ? "十" : `十${digits[index % 10]}`;
  if (index < 100) return `${digits[Math.floor(index / 10)]}十${index % 10 === 0 ? "" : digits[index % 10]}`;
  return String(index);
}

export function searchSnippet(text: string, query: string, length = 92): string {
  const offset = text.toLowerCase().indexOf(query.toLowerCase());
  if (query === "" || offset < 0) return truncate(text, length);
  const characters = Array.from(text), at = Array.from(text.slice(0, offset)).length;
  const queryLength = Array.from(query).length;
  const start = Math.max(0, at - Math.max(8, Math.floor((length - queryLength) / 2)));
  const end = Math.min(characters.length, start + Math.max(length, queryLength));
  return (start > 0 ? "…" : "") + characters.slice(start, end).join("") + (end < characters.length ? "…" : "");
}
