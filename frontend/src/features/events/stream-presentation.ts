import { timedChunks, type AssistantStreamRecord } from "./assistant-stream";

export interface GeneratingTool {
  readonly index: number;
  readonly id: string;
  readonly name: string | null;
  readonly arguments: string;
}
export type PresentedBlock =
  | (({ readonly type: "text" } | { readonly type: "reasoning" }) & {
      readonly index: number;
      readonly text: string;
      readonly startedAt: string | null;
      readonly finishedAt: string | null;
    })
  | ({ readonly type: "tool-call" } & GeneratingTool);

export function streamPresentation(
  stream: readonly AssistantStreamRecord[],
  outputLimit: number,
) {
  type Partial = {
    kind: "text" | "reasoning" | "tool-call";
    text: string;
    id: string | null;
    name: string | null;
    arguments: string;
    started: number | null;
    finished: number | null;
    observed: boolean;
  };
  const partials = new Map<number, Partial>();
  function ensure(index: number, kind: Partial["kind"]) {
    let partial = partials.get(index);
    if (partial === undefined) {
      partial = {
        kind,
        text: "",
        id: null,
        name: null,
        arguments: "",
        started: null,
        finished: null,
        observed: false,
      };
      partials.set(index, partial);
    }
    if (partial.kind !== kind) return null;
    return partial;
  }
  // A failed attempt retains its rejected terminal observation in the raw log.
  // Show only the accepted prefix; the durable outcome carries the protocol error.
  for (const { time, chunk } of timedChunks(stream)) {
    if (chunk.type === "block-start") {
      if (partials.has(chunk.index)) break;
      ensure(chunk.index, chunk.block_type);
    } else if (
      chunk.type === "text-delta" ||
      chunk.type === "reasoning-delta"
    ) {
      const partial = ensure(
        chunk.index,
        chunk.type === "text-delta" ? "text" : "reasoning",
      );
      if (partial === null || partial.finished !== null) break;
      partial.observed = true;
      partial.text += chunk.text;
      if (chunk.text !== "" && partial.started === null) partial.started = time;
    } else if (chunk.type === "tool-call-delta") {
      const partial = ensure(chunk.index, "tool-call");
      if (partial === null || partial.finished !== null) break;
      partial.observed = true;
      partial.id = chunk.id;
      if (chunk.name !== null) partial.name = chunk.name;
      partial.arguments += chunk.arguments_delta;
    } else if (chunk.type === "block-end") {
      const partial = ensure(chunk.index, chunk.block.type);
      if (partial === null || partial.finished !== null) break;
      if (chunk.block.type === "tool-call") {
        if (
          (partial.id !== null && partial.id !== chunk.block.id) ||
          (partial.name !== null && partial.name !== chunk.block.name) ||
          (partial.observed && partial.arguments !== chunk.block.arguments)
        )
          break;
        partial.id = chunk.block.id;
        partial.name = chunk.block.name;
        partial.arguments = chunk.block.arguments;
      } else {
        if (partial.observed && partial.text !== chunk.block.text) break;
        partial.text = chunk.block.text;
        if (partial.started === null && partial.text !== "")
          partial.started = time;
      }
      partial.finished = time;
    }
  }
  let remaining = outputLimit;
  const blocks: PresentedBlock[] = [];
  for (const [index, partial] of partials) {
    if (partial.kind === "tool-call") {
      if (partial.id !== null)
        blocks.push({
          type: "tool-call",
          index,
          id: partial.id,
          name: partial.name,
          arguments: partial.arguments,
        });
    } else {
      const text = Array.from(partial.text).slice(0, remaining).join("");
      remaining -= Array.from(text).length;
      if (text !== "")
        blocks.push({
          type: partial.kind,
          index,
          text,
          startedAt:
            partial.started === null
              ? null
              : new Date(partial.started).toISOString(),
          finishedAt:
            partial.finished === null
              ? null
              : new Date(partial.finished).toISOString(),
        });
    }
  }
  const thoughts = blocks.filter((block) => block.type === "reasoning");
  const firstThought = thoughts[0];
  return {
    blocks,
    text: blocks
      .map((block) => (block.type === "text" ? block.text : ""))
      .join(""),
    reasoning:
      firstThought?.startedAt == null
        ? null
        : {
            text: thoughts.map((block) => block.text).join(""),
            startedAt: firstThought.startedAt,
            finishedAt: thoughts.at(-1)?.finishedAt ?? null,
          },
    tools: blocks.filter((block) => block.type === "tool-call"),
  };
}
