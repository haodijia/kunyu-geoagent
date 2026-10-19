import type { TrajectoryEventProjection } from "@/features/events/projection/events";
import {
  parseAssistantStream,
  type AssistantStreamRecord,
  type StreamChunk,
} from "@/features/events/stream/assistant-stream";
import type { ActiveAssistant } from "@/features/events/stream/live-assistant";
import type { ModelProviderType } from "@/features/settings/models/api";
import { providerName } from "@/features/settings/models/provider-copy";
import {
  contextArray,
  contextRecord as record,
  estimateEnvelope,
  estimateMessage,
  estimateStream,
} from "./context-estimate";

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
  readonly contextTokens: number;
  readonly estimated: boolean;
  readonly requestSequence: number;
  readonly usage: RequestTokenUsage | null;
  readonly historyCompacted: boolean;
  readonly compaction: { readonly trigger: "manual" | "pressure" | "context-overflow"; readonly outcome: string } | null;
}

type UsageChunk = Extract<StreamChunk, { readonly type: "usage" }>;

/** Harness-style measured prompt anchor plus signed estimated surface movement. */
export function projectContextUsage(events: readonly TrajectoryEventProjection[], active: ActiveAssistant | null): ContextUsage | null {
  let header: TrajectoryEventProjection | null = null;
  let snapshot: Readonly<Record<string, unknown>> | null = null;
  let route: string | null = null;
  let envelopeTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let toolTokens = 0;
  let estimated = true;
  let usage: RequestTokenUsage | null = null;
  let settled = false;
  let compaction: ContextUsage["compaction"] = null;
  let compactionStart: TrajectoryEventProjection | null = null;
  let compactionSelection: TrajectoryEventProjection | null = null;
  let historyCompacted = false;

  function observeStream(stream: readonly AssistantStreamRecord[], settlement?: Readonly<Record<string, unknown>>) {
    const sampleIndex = lastUsageIndex(stream);
    const sampleRecord = sampleIndex === -1 ? null : stream[sampleIndex]!;
    const sample = sampleRecord?.type === "chunk" && sampleRecord.chunk.type === "usage" ? sampleRecord.chunk : null;
    const nextUsage = settlement === undefined
      ? (sample === null ? null : knownUsage(sample, sample))
      : knownUsage(settlement, sample);
    const estimatedOutput = estimateStream(stream);
    outputTokens = estimatedOutput;
    estimated = true;
    if (nextUsage === null) return;
    usage = nextUsage;
    const measuredInput = promptTokens(nextUsage, snapshot!.protocol);
    if (measuredInput !== null) inputTokens = measuredInput;
    if (nextUsage.outputTokens !== null) {
      const sampledOutput = settlement !== undefined || sampleIndex === -1 ? estimatedOutput : estimateStream(stream.slice(0, sampleIndex));
      const growth = Math.max(0, estimatedOutput - sampledOutput);
      outputTokens = nextUsage.outputTokens + growth;
      estimated = measuredInput === null || growth !== 0;
    }
  }

  for (const event of events) {
    if (event.eventType === "request.header") {
      const nextSnapshot = record(event.payload.model_snapshot);
      const nextRoute = JSON.stringify([nextSnapshot.connection_id, nextSnapshot.connection_revision, nextSnapshot.model_id, nextSnapshot.protocol]);
      const nextEnvelope = estimateEnvelope(event.payload.messages, event.payload.tools);
      // The next envelope already contains the previous assistant and tool results.
      inputTokens = nextRoute === route ? Math.max(0, inputTokens + nextEnvelope - envelopeTokens) : nextEnvelope;
      if (nextRoute !== route) usage = null;
      header = event;
      snapshot = nextSnapshot;
      route = nextRoute;
      envelopeTokens = nextEnvelope;
      outputTokens = toolTokens = 0;
      estimated = true;
      settled = historyCompacted = false;
      compaction = compactionStart = compactionSelection = null;
      continue;
    }
    if (header === null) continue;
    if (event.eventType === "model.attempt.finished" && event.payload.message_id === header.payload.message_id) {
      if (event.runId !== header.runId || event.payload.step !== header.payload.step || event.payload.attempt !== header.payload.attempt || settled) throw new Error("Usage settlement belongs to another request.");
      observeStream(parseAssistantStream(event.payload.stream), event.payload);
      settled = true;
    }
    if (["tool.completed", "tool.failed", "tool.cancelled"].includes(event.eventType) && event.runId === header.runId && event.payload.message_id === header.payload.message_id) {
      const content = event.eventType === "tool.completed" ? event.payload.content : [{
        type: "text",
        text: JSON.stringify({ status: event.eventType === "tool.failed" ? "failed" : "cancelled", error_code: event.payload.error_code ?? null, error_summary: event.payload.error_summary ?? null }),
      }];
      toolTokens += estimateMessage({ role: "tool", content });
      estimated = true;
    }
    if (event.eventType === "compaction/start") {
      const trigger = event.payload.trigger;
      if (trigger !== "manual" && trigger !== "pressure" && trigger !== "context-overflow") throw new Error("Invalid usage compaction trigger.");
      if (typeof event.payload.compaction_id !== "string") throw new Error("Invalid usage compaction identity.");
      compactionStart = event;
      compactionSelection = null;
      compaction = { trigger, outcome: "running" };
    }
    if (event.eventType === "compaction/selection" && event.payload.compaction_id === compactionStart?.payload.compaction_id) compactionSelection = event;
    if (event.eventType === "compaction/end" && event.payload.compaction_id === compactionStart?.payload.compaction_id && compaction !== null) {
      if (typeof event.payload.outcome !== "string") throw new Error("Invalid usage compaction outcome.");
      compaction = { ...compaction, outcome: event.payload.outcome };
    }
    if (event.eventType === "history/compacted") {
      if (compactionStart === null || compactionSelection === null || compaction?.outcome !== "completed") throw new Error("Context compaction is missing its committed selection.");
      const protectedCount = tokenCount(compactionSelection.payload.protected_messages);
      if (protectedCount === null || typeof event.payload.summary !== "string") throw new Error("Invalid context compaction replacement.");
      const messages = [
        ...contextArray(compactionStart.payload.messages).slice(0, protectedCount),
        { role: "user", content: [{ type: "text", text: event.payload.summary }] },
        ...contextArray(compactionSelection.payload.retained_messages),
      ];
      const nextEnvelope = estimateEnvelope(messages, header.payload.tools);
      inputTokens = Math.max(0, inputTokens + nextEnvelope - envelopeTokens);
      envelopeTokens = nextEnvelope;
      outputTokens = toolTokens = 0;
      estimated = historyCompacted = true;
    }
  }
  if (header === null || snapshot === null) return null;
  if (!settled && active !== null && active.run_id === header.runId && active.step === header.payload.step && active.attempt === header.payload.attempt && active.started_after_sequence >= header.sequence) {
    observeStream(active.stream);
  }
  const modelId = snapshot.model_id;
  if (typeof snapshot.provider_type !== "string" || !Object.hasOwn(providerName, snapshot.provider_type)) throw new Error("Invalid usage provider route.");
  const providerType = snapshot.provider_type as ModelProviderType;
  if (typeof modelId !== "string" || modelId.length === 0) throw new Error("Invalid usage model route.");
  const contextWindow = tokenCount(snapshot.context_window);
  if (contextWindow === 0) throw new Error("Invalid usage context window.");
  return { modelId, providerType, contextWindow, contextTokens: inputTokens + outputTokens + toolTokens, estimated, requestSequence: header.sequence, usage, historyCompacted, compaction };
}

function lastUsageIndex(stream: readonly AssistantStreamRecord[]): number {
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const item = stream[index]!;
    if (item.type === "chunk" && item.chunk.type === "usage") return index;
  }
  return -1;
}

function promptTokens(usage: RequestTokenUsage, protocol: unknown): number | null {
  if (!["openai_compatible", "deepseek_messages", "openai_responses"].includes(String(protocol))) throw new Error("Invalid context usage protocol.");
  if (usage.inputTokens === null) return null;
  // Messages separates cache buckets; Chat/Responses already includes them.
  return usage.inputTokens + (protocol === "deepseek_messages" ? (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0) : 0);
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
