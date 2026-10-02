import { attachRequestDetails } from "./trajectory-requests";
import { sanitizeTrajectoryValue } from "./trajectory-sanitize";
import type { Confirmation } from "@/features/confirmations/api";
import type { SessionMessage } from "@/features/messages/api";
import type { AgentTurn, ToolCall } from "@/features/agent/api";
import { zhCN } from "@/locales/zh-CN";
import type { TrajectoryEventProjection } from "./projection";
import type {
  AssistantMetricDetail,
  TrajectoryRecord,
  TrajectoryUsage,
} from "./trajectory-model";

interface RecordContext {
  readonly messages: ReadonlyMap<string, SessionMessage>;
  readonly runs: ReadonlyMap<string, AgentTurn>;
  readonly tools: ReadonlyMap<string, ToolCall>;
  readonly confirmations: ReadonlyMap<string, Confirmation>;
  readonly runTurns: ReadonlyMap<string, number>;
  readonly messageTurns: ReadonlyMap<string, number>;
}

export function buildTrajectoryRecords(
  events: readonly TrajectoryEventProjection[],
  messages: readonly SessionMessage[],
  runs: readonly AgentTurn[] = [],
  confirmations: readonly Confirmation[] = [],
): TrajectoryRecord[] {
  const ordered = [...events].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const runTurns = new Map<string, number>();
  const messageTurns = new Map<string, number>();
  let turn = 0;
  for (const event of ordered) {
    if (event.kind !== "user") continue;
    turn += 1;
    messageTurns.set(event.entityId, turn);
    if (event.runId !== null) runTurns.set(event.runId, turn);
  }

  const grouped = new Map<string, TrajectoryEventProjection[]>();
  for (const event of ordered) {
    const key = `${event.kind}\u0000${event.entityId}`;
    const current = grouped.get(key);
    if (current === undefined) grouped.set(key, [event]);
    else current.push(event);
  }

  const runMap = new Map(runs.map((run) => [run.id, run]));
  const context: RecordContext = {
    messages: new Map(messages.map((message) => [message.id, message])),
    runs: runMap,
    tools: new Map(
      runs.flatMap((run) => run.tool_calls).map((tool) => [tool.id, tool]),
    ),
    confirmations: new Map(confirmations.map((item) => [item.id, item])),
    runTurns,
    messageTurns,
  };
  const records = [...grouped.values()].map((group) =>
    buildRecord(group, context),
  );
  return attachRequestDetails(
    records,
    ordered.filter((event) => event.kind === "system"),
  );
}

function buildRecord(
  events: readonly TrajectoryEventProjection[],
  context: RecordContext,
): TrajectoryRecord {
  const first = events[0]!;
  switch (first.kind) {
    case "system":
      return systemRecord(events, context);
    case "context":
      return contextRecord(events, context);
    case "user":
      return userRecord(events, context);
    case "assistant":
      return assistantRecord(events, context);
    case "tool":
      return toolRecord(events, context);
    case "confirmation":
      return confirmationRecord(events, context);
    case "unsupported":
      return unsupportedRecord(first, context);
  }
}

function contextRecord(
  events: readonly TrajectoryEventProjection[],
  context: RecordContext,
): TrajectoryRecord {
  const first = events[0]!;
  const done = events.find((event) => event.eventType === "command/done");
  const isCommand = first.eventType === "command/run";
  const content = isCommand
    ? `/${String(first.payload.name)}${stringValue(first.payload.raw_input) ?? ""}`
    : stringValue(first.payload.content) ?? stringValue(first.payload.summary) ?? stringValue(first.payload.text) ?? `${first.eventType} ${safeString(first.payload)}`;
  const output = isCommand ? stringValue(done?.payload.text) : null;
  return baseRecord(events, {
    turn: turnFor(first, context),
    text: content,
    searchText: `${content} ${output ?? ""}`,
    status: isCommand && done === undefined ? "running" : done?.payload.kind === "error" ? "failed" : "completed",
    completedAt: isCommand ? done?.occurredAt ?? null : first.occurredAt,
    startedAt: first.occurredAt,
    isError: done?.payload.kind === "error",
    source: isCommand ? {
      kind: "command",
      command_id: first.entityId,
      definition_id: first.payload.definition_id,
      source_event_sequence: done?.payload.source_event_sequence ?? null,
    } : {
      kind: "context",
      producer: first.payload.producer ?? first.eventType,
      metadata: first.payload.metadata,
      session_id: first.payload.session_id ?? null,
    },
    input: isCommand || first.eventType === "context.injected" ? content : first.payload,
    output,
  });
}

function systemRecord(
  events: readonly TrajectoryEventProjection[],
  context: RecordContext,
): TrajectoryRecord {
  const first = events[0]!;
  const prompt = stringValue(first.payload.system_prompt) ?? "";
  const modelId = stringValue(first.payload.model_id) ?? "";
  const tools = Array.isArray(first.payload.tools) ? first.payload.tools : [];
  return baseRecord(events, {
    turn: turnFor(first, context),
    text: zhCN.trajectory.initialPrompt,
    searchText: `${prompt} ${modelId} ${safeString(tools)}`,
    status: "completed",
    completedAt: first.occurredAt,
    startedAt: first.occurredAt,
    isError: false,
    source: {
      run_id: first.runId,
      message_id: first.payload.message_id ?? null,
      step: first.payload.step ?? null,
      attempt: first.payload.attempt ?? null,
    },
    input: {
      system_prompt: prompt,
      messages: sanitizeTrajectoryValue(first.payload.messages ?? []),
      tools: sanitizeTrajectoryValue(tools),
      model: {
        model_id: modelId || null,
        reasoning_effort: first.payload.reasoning_effort ?? null,
        max_output_tokens: first.payload.max_output_tokens ?? null,
      },
    },
    output: null,
  });
}

function userRecord(
  events: readonly TrajectoryEventProjection[],
  context: RecordContext,
): TrajectoryRecord {
  const first = events[0]!;
  const message = context.messages.get(first.entityId);
  const content =
    message?.role === "user"
      ? message.content
      : (stringValue(first.payload.content) ?? "");
  return baseRecord(events, {
    turn: context.messageTurns.get(first.entityId) ?? null,
    text: content,
    searchText: content,
    status: "completed",
    completedAt: first.occurredAt,
    startedAt: first.occurredAt,
    isError: false,
    source: { role: "user", message_id: first.entityId, run_id: first.runId },
    input: content,
    output: null,
  });
}

function assistantRecord(
  events: readonly TrajectoryEventProjection[],
  context: RecordContext,
): TrajectoryRecord {
  const first = events[0]!;
  const started = events.find(
    (event) => event.eventType === "message.assistant.started",
  );
  const completed = [...events]
    .reverse()
    .find(
      (event) =>
        event.eventType === "model.attempt.finished" ||
        event.eventType === "message.assistant.completed",
    );
  const attemptFinished = [...events]
    .reverse()
    .find((event) => event.eventType === "model.attempt.finished");
  const messageId =
    events.find((event) => event.messageId !== null)?.messageId ?? null;
  const message =
    messageId === null ? undefined : context.messages.get(messageId);
  const run = first.runId === null ? undefined : context.runs.get(first.runId);
  const content =
    message?.role === "assistant"
      ? message.content
      : reconstructAssistantText(events);
  const finishReason = events.find(
    (event) => event.eventType === "message.assistant.completed",
  )?.payload.finish_reason;
  const outcome = stringValue(attemptFinished?.payload.outcome);
  const status =
    message?.role === "assistant"
      ? message.status
      : outcome === "error" ||
          outcome === "length" ||
          outcome === "content_filter"
        ? "failed"
        : completed === undefined
          ? "streaming"
          : "completed";
  const step = integerValue(first.payload.step);
  const attempt = integerValue(first.payload.attempt);
  const startTime = timestamp(started?.occurredAt);
  const firstTokenTime = timestamp(
    events.find(
      (event) =>
        event.eventType === "message.assistant.delta" &&
        stringValue(event.payload.text) !== null,
    )?.occurredAt,
  );
  const completedTime = timestamp(completed?.occurredAt);
  const usage = usageFrom(attemptFinished);
  const displayText =
    content.trim().length > 0
      ? content
      : finishReason === "tool_calls"
        ? ""
        : zhCN.trajectory.emptyAssistant;
  return baseRecord(events, {
    turn: turnFor(first, context),
    text: displayText,
    searchText: [displayText, run?.model_snapshot.model_id ?? ""].join(" "),
    status,
    completedAt: completed?.occurredAt ?? null,
    startedAt: started?.occurredAt ?? null,
    isError:
      status === "failed" ||
      outcome === "error" ||
      outcome === "length" ||
      outcome === "content_filter",
    source: {
      role: "assistant",
      run_id: first.runId,
      message_id: messageId,
      step,
      attempt,
    },
    input: {
      model_id: run?.model_snapshot.model_id ?? null,
      reasoning_effort: run?.model_snapshot.reasoning_effort ?? null,
      step,
      attempt,
    },
    output: {
      content,
      finish_reason: typeof finishReason === "string" ? finishReason : null,
      outcome,
      error_code: stringValue(attemptFinished?.payload.error_code),
    },
    usage,
    callOnly: content.trim().length === 0 && finishReason === "tool_calls",
    assistantMetrics: {
      stepStartTime: startTime,
      firstTokenTime,
      completedTime,
      timingRecorded:
        startTime !== null &&
        firstTokenTime !== null &&
        completedTime !== null &&
        startTime <= firstTokenTime &&
        firstTokenTime <= completedTime,
    },
  });
}

function toolRecord(
  events: readonly TrajectoryEventProjection[],
  context: RecordContext,
): TrajectoryRecord {
  const first = events[0]!;
  const requested = events.find(
    (event) => event.eventType === "tool.requested",
  );
  const started = events.find((event) => event.eventType === "tool.started");
  const terminal = [...events]
    .reverse()
    .find(
      (event) =>
        event.eventType === "tool.completed" ||
        event.eventType === "tool.failed" ||
        event.eventType === "tool.cancelled",
    );
  const snapshot = context.tools.get(first.entityId);
  const name =
    snapshot?.name ??
    stringValue(requested?.payload.name) ??
    zhCN.trajectory.unknownTool;
  const status =
    terminal?.eventType.replace("tool.", "") ?? snapshot?.status ?? "pending";
  const input = sanitizeTrajectoryValue(
    snapshot?.arguments ?? requested?.payload.arguments ?? {},
  );
  const output = sanitizeTrajectoryValue(
    snapshot?.error_summary !== null && snapshot?.error_summary !== undefined
      ? {
          error_code: snapshot.error_code,
          error_summary: snapshot.error_summary,
        }
      : (snapshot?.result ??
          terminal?.payload.result ??
          (terminal?.eventType === "tool.failed"
            ? {
                error_code: terminal.payload.error_code,
                error_summary: terminal.payload.error_summary,
              }
            : null)),
  );
  return baseRecord(events, {
    turn: turnFor(first, context),
    text: `${name} ${safeString(input)}`,
    searchText: `${name} ${toolLabel(name)} ${safeString(input)} ${safeString(output)}`,
    status,
    completedAt: terminal?.occurredAt ?? null,
    startedAt: started?.occurredAt ?? null,
    isError: status === "failed",
    source: {
      run_id: first.runId,
      message_id: requested?.messageId ?? snapshot?.message_id ?? null,
      tool_call_id: first.entityId,
      provider_call_id:
        snapshot?.provider_call_id ??
        requested?.payload.provider_call_id ??
        null,
      tool_name: name,
      step: requested?.payload.step ?? snapshot?.step ?? null,
      attempt: requested?.payload.attempt ?? snapshot?.attempt ?? null,
    },
    input,
    output,
  });
}

function confirmationRecord(
  events: readonly TrajectoryEventProjection[],
  context: RecordContext,
): TrajectoryRecord {
  const first = events[0]!;
  const requested = events.find(
    (event) => event.eventType === "confirmation.requested",
  );
  const resolved = [...events]
    .reverse()
    .find((event) => event.eventType === "confirmation.resolved");
  const snapshot = context.confirmations.get(first.entityId);
  const status =
    stringValue(resolved?.payload.decision) ?? snapshot?.status ?? "pending";
  const name =
    snapshot?.name ??
    stringValue(requested?.payload.name) ??
    zhCN.trajectory.unknownTool;
  const summary =
    snapshot?.summary ??
    stringValue(requested?.payload.summary) ??
    toolLabel(name);
  const input = sanitizeTrajectoryValue(
    snapshot?.arguments ?? requested?.payload.arguments ?? {},
  );
  return baseRecord(events, {
    turn: turnFor(first, context),
    text: `${summary} · ${statusLabel(status)}`,
    searchText: `${summary} ${name} ${safeString(input)}`,
    status,
    completedAt: resolved?.occurredAt ?? null,
    startedAt: requested?.occurredAt ?? null,
    isError: status === "rejected" || status === "cancelled",
    source: {
      run_id: first.runId,
      confirmation_id: first.entityId,
      tool_call_id:
        snapshot?.tool_call_id ?? requested?.payload.tool_call_id ?? null,
      tool_name: name,
      workspace_id:
        snapshot?.workspace_id ?? requested?.payload.workspace_id ?? null,
    },
    input: {
      arguments: input,
      side_effect:
        snapshot?.side_effect ?? requested?.payload.side_effect ?? null,
    },
    output:
      resolved === undefined
        ? null
        : {
            decision: status,
            decided_at:
              resolved.payload.decided_at ?? snapshot?.decided_at ?? null,
          },
  });
}

function unsupportedRecord(
  event: TrajectoryEventProjection,
  context: RecordContext,
): TrajectoryRecord {
  const payload = sanitizeTrajectoryValue(event.payload);
  return baseRecord([event], {
    turn: turnFor(event, context),
    text: `${event.eventType} · ${zhCN.trajectory.unsupportedDescription}`,
    searchText: `${event.eventType} ${safeString(payload)}`,
    status: "unsupported",
    completedAt: null,
    startedAt: event.occurredAt,
    isError: false,
    source: {
      run_id: event.runId,
      event_id: event.id,
      event_type: event.eventType,
    },
    input: payload,
    output: null,
  });
}

function baseRecord(
  events: readonly TrajectoryEventProjection[],
  value: {
    readonly turn: number | null;
    readonly text: string;
    readonly searchText: string;
    readonly status: string;
    readonly completedAt: string | null;
    readonly startedAt: string | null;
    readonly isError: boolean;
    readonly source: Readonly<Record<string, unknown>>;
    readonly input: unknown | null;
    readonly output: unknown | null;
    readonly usage?: TrajectoryUsage | null;
    readonly assistantMetrics?: AssistantMetricDetail;
    readonly callOnly?: boolean;
  },
): TrajectoryRecord {
  const first = events[0]!;
  const last = events.at(-1)!;
  const durationMillis = duration(value.startedAt, value.completedAt);
  return {
    id: `${first.kind}:${first.entityId}`,
    index: first.sequence,
    lastIndex: last.sequence,
    turn: value.turn,
    kind: first.kind,
    text: value.text,
    searchText: value.searchText,
    occurredAt: value.startedAt ?? first.occurredAt,
    completedAt: value.completedAt,
    durationMillis,
    status: value.status,
    isError: value.isError,
    source: sanitizeTrajectoryValue(value.source) as Readonly<
      Record<string, unknown>
    >,
    input: value.input,
    output: value.output,
    raw: {
      events: events.map((event) => ({
        sequence: event.sequence,
        event_type: event.eventType,
        occurred_at: event.occurredAt,
        payload: sanitizeTrajectoryValue(event.payload),
      })),
    },
    ...(integerValue(first.payload.step) === null
      ? {}
      : { step: integerValue(first.payload.step)! }),
    usage: value.usage ?? null,
    callOnly: value.callOnly,
    ...(value.assistantMetrics === undefined
      ? {}
      : { assistantMetrics: value.assistantMetrics }),
  };
}

function turnFor(
  event: TrajectoryEventProjection,
  context: RecordContext,
): number | null {
  return event.runId === null
    ? null
    : (context.runTurns.get(event.runId) ?? null);
}

function reconstructAssistantText(
  events: readonly TrajectoryEventProjection[],
): string {
  const result: string[] = [];
  for (const event of events) {
    if (event.eventType !== "message.assistant.delta") continue;
    const text = stringValue(event.payload.text);
    const offset = integerValue(event.payload.offset);
    if (text === null || offset === null || offset > result.length) continue;
    const delta = Array.from(text);
    const overlap = Math.min(result.length - offset, delta.length);
    if (
      result
        .slice(offset, offset + overlap)
        .some((item, index) => item !== delta[index])
    )
      continue;
    result.push(...delta.slice(overlap));
  }
  return result.join("");
}

function usageFrom(
  event: TrajectoryEventProjection | undefined,
): TrajectoryUsage | null {
  if (event === undefined) return null;
  const inputTokens = nullableInteger(event.payload.input_tokens);
  const outputTokens = nullableInteger(event.payload.output_tokens);
  const totalTokens = nullableInteger(event.payload.total_tokens);
  if (inputTokens === null && outputTokens === null && totalTokens === null)
    return null;
  return { inputTokens, outputTokens, totalTokens };
}

function duration(start: string | null, end: string | null): number | null {
  const startTime = timestamp(start);
  const endTime = timestamp(end);
  if (startTime === null || endTime === null || endTime < startTime)
    return null;
  return endTime - startTime;
}

function timestamp(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integerValue(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

function nullableInteger(value: unknown): number | null {
  return value === null ? null : integerValue(value);
}

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function toolLabel(name: string): string {
  const names = zhCN.conversation.tools.names as Readonly<
    Record<string, string>
  >;
  return names[name] ?? name;
}

function statusLabel(status: string): string {
  const labels = zhCN.trajectory.statuses as Readonly<Record<string, string>>;
  return labels[status] ?? status;
}
