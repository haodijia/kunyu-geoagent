import {
  validContentBlock,
  validReplayEnvelope,
  type ContentBlock,
  type ReplayEnvelope,
} from "./content-blocks";
/** Compact attempt records retain exact model chunk boundaries and timestamps. */
export type StreamOrigin = "model" | "buffered";
type TextChunk = {
  readonly type: "text-delta" | "reasoning-delta";
  readonly index: number;
  readonly text: string;
};
type ToolDelta = {
  readonly type: "tool-call-delta";
  readonly index: number;
  readonly id: string;
  readonly name: string | null;
  readonly arguments_delta: string;
};
type BlockStart = {
  readonly type: "block-start";
  readonly index: number;
  readonly block_type: "text" | "reasoning" | "tool-call";
};
type BlockEnd = {
  readonly type: "block-end";
  readonly index: number;
  readonly block: ContentBlock;
};
type Usage = {
  readonly type: "usage";
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly total_tokens: number | null;
};
type Finish = {
  readonly type: "finish";
  readonly reason: "stop" | "tool_calls" | "length" | "content_filter";
  readonly replay_state: ReplayEnvelope | null;
};
export type StreamChunk =
  TextChunk | ToolDelta | BlockStart | BlockEnd | Usage | Finish;
interface PackedRun {
  readonly time0: number;
  readonly index: number;
  readonly dt: readonly number[];
}
type TextRun = PackedRun & {
  readonly type: "text-chunks" | "reasoning-chunks";
  readonly texts: readonly string[];
};
type ToolRun = PackedRun & {
  readonly type: "tool-call-chunks";
  readonly id: string;
  readonly name: string | null;
  readonly args: readonly string[];
};
export type AssistantStreamRecord =
  | TextRun
  | ToolRun
  | {
      readonly type: "chunk";
      readonly time: number;
      readonly chunk: StreamChunk;
    };

export function parseAssistantStream(
  value: unknown,
): readonly AssistantStreamRecord[] {
  if (!Array.isArray(value))
    throw new Error("Attempt stream must be an array.");
  for (const record of value) {
    if (!isObject(record)) throw new Error("Invalid assistant stream record.");
    if (record.type === "chunk") {
      if (!integer(record.time) || !validChunk(record.chunk))
        throw new Error("Invalid raw assistant stream chunk.");
      continue;
    }
    const members =
      record.type === "text-chunks" || record.type === "reasoning-chunks"
        ? record.texts
        : record.type === "tool-call-chunks"
          ? record.args
          : null;
    if (
      !integer(record.time0) ||
      !index(record.index) ||
      !Array.isArray(record.dt) ||
      !record.dt.every(integer) ||
      !Array.isArray(members) ||
      !members.length ||
      !members.every((item) => typeof item === "string") ||
      record.dt.length !== members.length - 1
    )
      throw new Error("Invalid packed assistant stream run.");
    if (
      record.type === "tool-call-chunks" &&
      (typeof record.id !== "string" ||
        !record.id ||
        !(
          record.name === null ||
          (typeof record.name === "string" && record.name.length > 0)
        ))
    )
      throw new Error("Invalid packed tool-call stream.");
    let time = record.time0 as number;
    for (const gap of record.dt) {
      time += gap as number;
      if (!integer(time)) throw new Error("Unsafe assistant stream timestamp.");
    }
  }
  return value as readonly AssistantStreamRecord[];
}

export function parseStreamOrigin(value: unknown): StreamOrigin {
  if (value !== "model" && value !== "buffered")
    throw new Error("Unknown assistant stream timing origin.");
  return value;
}

export function assistantStreamFirstTokenTime(
  stream: readonly AssistantStreamRecord[],
): number | null {
  for (const record of stream) {
    if (record.type === "chunk") {
      const chunk = record.chunk;
      if (
        ((chunk.type === "text-delta" || chunk.type === "reasoning-delta") &&
          chunk.text !== "") ||
        (chunk.type === "tool-call-delta" &&
          (chunk.name !== null || chunk.arguments_delta !== "")) ||
        (chunk.type === "block-end" &&
          (chunk.block.type === "tool-call" || chunk.block.text !== ""))
      )
        return record.time;
    } else {
      const members =
        record.type === "tool-call-chunks" ? record.args : record.texts;
      const time = firstMemberTime(
        record,
        members,
        (text) =>
          text !== "" ||
          (record.type === "tool-call-chunks" && record.name !== null),
      );
      if (time !== null) return time;
    }
  }
  return null;
}

export function assistantStreamChunkCount(
  stream: readonly AssistantStreamRecord[],
): number {
  return stream.reduce(
    (count, record) =>
      count +
      (record.type === "chunk"
        ? 1
        : record.type === "tool-call-chunks"
          ? record.args.length
          : record.texts.length),
    0,
  );
}

export function assistantStreamText(
  stream: readonly AssistantStreamRecord[],
): string {
  const observed = new Set<number>();
  let result = "";
  for (const { chunk } of timedChunks(stream)) {
    if (chunk.type === "text-delta") {
      observed.add(chunk.index);
      result += chunk.text;
    } else if (
      chunk.type === "block-end" &&
      chunk.block.type === "text" &&
      !observed.has(chunk.index)
    )
      result += chunk.block.text;
  }
  return result;
}

export function streamReasoning(
  stream: readonly AssistantStreamRecord[],
  settledAt: string,
) {
  let text = "";
  const observed = new Set<number>();
  let started: number | null = null;
  let finished: number | null = null;
  for (const record of stream) {
    let reason: string | null = null;
    let reasoningTime: number | null = null;
    let nextOutputTime: number | null = null;
    if (record.type === "reasoning-chunks") {
      observed.add(record.index);
      reason = record.texts.join("");
      reasoningTime = firstMemberTime(
        record,
        record.texts,
        (member) => member !== "",
      );
    } else if (record.type === "text-chunks") {
      nextOutputTime = firstMemberTime(
        record,
        record.texts,
        (member) => member !== "",
      );
    } else if (record.type === "tool-call-chunks") {
      nextOutputTime = firstMemberTime(
        record,
        record.args,
        (member) => member !== "" || record.name !== null,
      );
    } else if (record.type === "chunk") {
      const chunk = record.chunk;
      if (chunk.type === "reasoning-delta") {
        observed.add(chunk.index);
        reason = chunk.text;
        reasoningTime = chunk.text === "" ? null : record.time;
      } else if (
        chunk.type === "block-end" &&
        chunk.block.type === "reasoning" &&
        !observed.has(chunk.index)
      ) {
        reason = chunk.block.text;
        reasoningTime = reason === "" ? null : record.time;
      } else if (
        (chunk.type === "text-delta" && chunk.text !== "") ||
        (chunk.type === "block-end" &&
          chunk.block.type === "text" &&
          chunk.block.text !== "") ||
        (chunk.type === "block-end" && chunk.block.type === "tool-call") ||
        (chunk.type === "tool-call-delta" &&
          (chunk.name !== null || chunk.arguments_delta !== ""))
      )
        nextOutputTime = record.time;
    }
    if (reason !== null) {
      text += reason;
      if (started === null && reasoningTime !== null) started = reasoningTime;
    }
    if (started !== null && finished === null && nextOutputTime !== null)
      finished = nextOutputTime;
  }
  return text === "" || started === null
    ? null
    : {
        text,
        startedAt: new Date(started).toISOString(),
        finishedAt:
          finished === null ? settledAt : new Date(finished).toISOString(),
      };
}

function firstMemberTime(
  record: PackedRun,
  members: readonly string[],
  predicate: (member: string) => boolean,
): number | null {
  let time = record.time0;
  for (let index = 0; index < members.length; index += 1) {
    if (index > 0) time += record.dt[index - 1]!;
    if (predicate(members[index]!)) return time;
  }
  return null;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function integer(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0)
  );
}
function index(value: unknown): boolean {
  return integer(value) && value >= 0;
}
export function parseStreamChunk(value: unknown): StreamChunk {
  if (!validChunk(value)) throw new Error("Invalid assistant stream chunk.");
  return value as StreamChunk;
}

function validChunk(value: unknown): boolean {
  if (!isObject(value)) return false;
  switch (value.type) {
    case "text-delta":
    case "reasoning-delta":
      return index(value.index) && typeof value.text === "string";
    case "tool-call-delta":
      return (
        index(value.index) &&
        typeof value.id === "string" &&
        (value.name === null || typeof value.name === "string") &&
        typeof value.arguments_delta === "string"
      );
    case "block-start":
      return (
        index(value.index) &&
        ["text", "reasoning", "tool-call"].includes(String(value.block_type))
      );
    case "block-end":
      return index(value.index) && validContentBlock(value.block);
    case "usage":
      return [
        value.input_tokens,
        value.output_tokens,
        value.total_tokens,
      ].every((count) => count === null || index(count));
    case "finish":
      return (
        ["stop", "tool_calls", "length", "content_filter"].includes(
          String(value.reason),
        ) && validReplayEnvelope(value.replay_state)
      );
    default:
      return false;
  }
}

export function* timedChunks(
  stream: readonly AssistantStreamRecord[],
): Generator<{ time: number; chunk: StreamChunk }> {
  for (const record of stream) {
    if (record.type === "chunk") {
      yield { time: record.time, chunk: record.chunk };
      continue;
    }
    const members =
      record.type === "tool-call-chunks" ? record.args : record.texts;
    let time = record.time0;
    for (let index = 0; index < members.length; index++) {
      if (index > 0) time += record.dt[index - 1]!;
      yield {
        time,
        chunk:
          record.type === "tool-call-chunks"
            ? {
                type: "tool-call-delta",
                index: record.index,
                id: record.id,
                name: record.name,
                arguments_delta: members[index]!,
              }
            : {
                type:
                  record.type === "text-chunks"
                    ? "text-delta"
                    : "reasoning-delta",
                index: record.index,
                text: members[index]!,
              },
      };
    }
  }
}
