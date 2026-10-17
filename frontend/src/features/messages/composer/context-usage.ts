import type { TrajectoryEventProjection } from "@/features/events/projection/events";
import {
  parseAssistantStream,
  type AssistantStreamRecord,
  type StreamChunk,
} from "@/features/events/stream/assistant-stream";
import type { ActiveAssistant } from "@/features/events/stream/live-assistant";
import type { ModelProviderType } from "@/features/settings/models/api";
import { providerName } from "@/features/settings/models/provider-copy";

export interface RequestTokenUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
}

export interface ContextUsage {
  readonly modelId: string;
  readonly providerType: ModelProviderType;
  readonly contextWindow: number | null;
  readonly contextTokens: number | null;
  readonly requestSequence: number;
  readonly usage: RequestTokenUsage | null;
  readonly historyCompacted: boolean;
  readonly compaction: { readonly trigger: "manual" | "pressure" | "context-overflow"; readonly outcome: string } | null;
}

type UsageChunk = Extract<StreamChunk, { readonly type: "usage" }>;

/** Observe one actual routed request; auxiliary usage never replaces its sample. */
export function projectContextUsage(events: readonly TrajectoryEventProjection[], active: ActiveAssistant | null): ContextUsage | null {
  let header: TrajectoryEventProjection | undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]!.eventType === "request.header") { header = events[index]; break; }
  }
  if (header === undefined) return null;
  const snapshot = record(header.payload.model_snapshot);
  const modelId = snapshot.model_id;
  if (typeof snapshot.provider_type !== "string" || !Object.hasOwn(providerName, snapshot.provider_type)) throw new Error("Invalid usage provider route.");
  const providerType = snapshot.provider_type as ModelProviderType;
  if (typeof modelId !== "string" || modelId.length === 0) throw new Error("Invalid usage model route.");
  const contextWindow = tokenCount(snapshot.context_window);
  if (contextWindow === 0) throw new Error("Invalid usage context window.");
  let settled: TrajectoryEventProjection | null = null;
  let compaction: ContextUsage["compaction"] = null;
  let compactionId: string | null = null;
  let historyCompacted = false;
  for (const event of events) {
    if (event.sequence <= header.sequence) continue;
    if (event.eventType === "model.attempt.finished" && event.payload.message_id === header.payload.message_id) {
      if (event.runId !== header.runId || event.payload.step !== header.payload.step || event.payload.attempt !== header.payload.attempt || settled !== null) throw new Error("Usage settlement belongs to another request.");
      settled = event;
    }
    if (event.eventType === "history/compacted") historyCompacted = true;
    if (event.eventType === "compaction/start") {
      const trigger = event.payload.trigger;
      if (trigger !== "manual" && trigger !== "pressure" && trigger !== "context-overflow") throw new Error("Invalid usage compaction trigger.");
      if (typeof event.payload.compaction_id !== "string") throw new Error("Invalid usage compaction identity.");
      compactionId = event.payload.compaction_id;
      compaction = { trigger, outcome: "running" };
    }
    if (event.eventType === "compaction/end" && event.payload.compaction_id === compactionId && compaction !== null) {
      if (typeof event.payload.outcome !== "string") throw new Error("Invalid usage compaction outcome.");
      compaction = { ...compaction, outcome: event.payload.outcome };
    }
  }
  let usage: RequestTokenUsage | null = null;
  if (settled !== null) {
    const sample = lastUsage(parseAssistantStream(settled.payload.stream));
    usage = knownUsage(settled.payload, sample);
  } else if (active !== null && active.run_id === header.runId && active.step === header.payload.step && active.attempt === header.payload.attempt && active.started_after_sequence >= header.sequence) {
    const sample = lastUsage(active.stream);
    if (sample !== null) usage = knownUsage(sample, sample);
  }
  const protocol = snapshot.protocol;
  if (!["openai_compatible", "deepseek_messages", "openai_responses"].includes(String(protocol))) throw new Error("Invalid context usage protocol.");
  let contextTokens: number | null = null;
  if (usage !== null && usage.inputTokens !== null && usage.outputTokens !== null) {
    if (protocol === "deepseek_messages") {
      // Messages usage splits cached input from uncached input; all occupy context.
      if (usage.cacheReadTokens !== null && usage.cacheWriteTokens !== null)
        contextTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens;
    } else {
      // Chat Completions and Responses include cached tokens in input_tokens.
      contextTokens = usage.inputTokens + usage.outputTokens;
    }
  }
  return { modelId, providerType, contextWindow, contextTokens, requestSequence: header.sequence, usage, historyCompacted, compaction };
}

function lastUsage(stream: readonly AssistantStreamRecord[]): UsageChunk | null {
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const item = stream[index]!;
    if (item.type === "chunk" && item.chunk.type === "usage") return item.chunk;
  }
  return null;
}

function knownUsage(value: Readonly<Record<string, unknown>> | UsageChunk, sample: UsageChunk | null): RequestTokenUsage | null {
  const usage = {
    inputTokens: tokenCount(value.input_tokens), outputTokens: tokenCount(value.output_tokens), totalTokens: tokenCount(value.total_tokens),
    cacheReadTokens: sample === null || sample.cache_read_input_tokens === undefined ? null : tokenCount(sample.cache_read_input_tokens),
    cacheWriteTokens: sample === null || sample.cache_creation_input_tokens === undefined ? null : tokenCount(sample.cache_creation_input_tokens),
  };
  return Object.values(usage).every(count => count === null) ? null : usage;
}

function tokenCount(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid context usage count.");
  return value;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid context usage snapshot.");
  return value as Readonly<Record<string, unknown>>;
}
