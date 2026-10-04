import type { SessionEvent } from "@/features/events/api";

export interface LoadedSkill {
  readonly name: string;
  readonly source: string;
  readonly content: string;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Skill event requires an object.");
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error("Skill event requires a nonempty string.");
  return value;
}
function stepKey(run: unknown, step: unknown): string {
  if (!Number.isSafeInteger(step) || (step as number) < 1)
    throw new Error("Skill event requires a valid step.");
  return `${string(run)}:${step}`;
}

export function collectSessionSkills(events: readonly SessionEvent[]) {
  const steps = new Map<string, readonly string[]>();
  const byMessage = new Map<string, Map<string, LoadedSkill>>();
  const loaded = new Map<string, LoadedSkill>();
  const tools = new Map<string, string>();
  for (const event of events) {
    if (event.event_type === "agent/step/decision" && event.payload.kind === "enter") {
      if (!Array.isArray(event.payload.messages) || !Array.isArray(event.payload.input_ids))
        throw new Error("Skill step requires admitted messages and input identities.");
      const ids = event.payload.messages.map((value) => string(object(value).message_id))
        .filter((id) => (event.payload.input_ids as unknown[]).includes(id));
      steps.set(stepKey(event.run_id, event.payload.step), ids);
    } else if (event.event_type === "context.injected" && event.payload.producer === "skill-invocation") {
      const metadata = object(event.payload.metadata);
      const skill = { name: string(metadata.name), source: string(metadata.source), content: string(event.payload.content) };
      loaded.set(skill.name, skill);
      const ids = steps.get(stepKey(metadata.run_id, metadata.step));
      if (ids === undefined) throw new Error("Skill invocation has no admitted user step.");
      for (const id of ids) {
        let names = byMessage.get(id);
        if (names === undefined) { names = new Map(); byMessage.set(id, names); }
        names.set(skill.name, skill);
      }
    } else if (event.event_type === "tool.requested") {
      tools.set(string(event.payload.tool_call_id), string(event.payload.name));
    } else if (event.event_type === "tool.completed" && tools.get(string(event.payload.tool_call_id)) === "skill") {
      const result = object(event.payload.result);
      const skill = { name: string(result.name), source: string(result.source), content: string(result.content) };
      loaded.set(skill.name, skill);
    }
  }
  return { byMessage, loaded };
}

export function skillTextParts(text: string, loaded: ReadonlyMap<string, LoadedSkill>) {
  const parts: ({ readonly text: string } | { readonly text: string; readonly skill: LoadedSkill })[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g)) {
    const skill = loaded.get(match[2]!);
    if (skill === undefined) continue;
    const start = match.index + match[1]!.length;
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    const end = start + match[2]!.length + 1;
    parts.push({ text: text.slice(start, end), skill });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
