import type { SessionEvent } from "@/features/events/api";

export interface TodoItem {
  readonly content: string;
  readonly status: "pending" | "in_progress" | "completed";
}

export function parseTodos(value: unknown): readonly TodoItem[] {
  if (!Array.isArray(value)) throw new Error("Todo snapshot must be a list.");
  const contents = new Set<string>();
  let active = 0;
  for (const item of value) {
    if (
      typeof item !== "object" || item === null || Array.isArray(item) ||
      Object.keys(item).length !== 2 ||
      typeof item.content !== "string" || item.content.trim() !== item.content ||
      item.content.length === 0 || contents.has(item.content) ||
      !["pending", "in_progress", "completed"].includes(item.status)
    ) throw new Error("Invalid todo snapshot item.");
    contents.add(item.content);
    if (item.status === "in_progress") active++;
  }
  if (active > 1) throw new Error("Sequential work permits at most one active todo.");
  return value as readonly TodoItem[];
}

export function selectCurrentTodos(events: readonly SessionEvent[]) {
  let runId: string | null = null;
  let todos: readonly TodoItem[] | null = null;
  for (const event of events) {
    if (event.event_type === "run.started" && event.run_id !== runId) {
      runId = event.run_id;
      todos = null;
    } else if (event.event_type === "todo/write") {
      const snapshot = parseTodos(event.payload.todos);
      if (event.run_id === runId) todos = snapshot;
    }
  }
  return todos === null || runId === null ? null : { runId, todos };
}
