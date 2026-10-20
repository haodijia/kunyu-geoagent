import type { TrajectoryEventProjection } from "@/features/events/projection/events";
import {
  contentText,
  parseContentBlocks,
} from "@/features/events/stream/content-blocks";
import type { RecordContext } from "@/features/events/trajectory/records/context";
import {
  baseRecord,
  safeString,
  stringValue,
  tokenCount,
  turnFor,
} from "@/features/events/trajectory/records/shared";
import type { TrajectoryRecord } from "@/features/events/trajectory/trajectory-model";
import { sanitizeTrajectoryValue } from "@/features/events/trajectory/trajectory-sanitize";
import { zhCN } from "@/locales/zh-CN";

export function contextRecord(
  events: readonly TrajectoryEventProjection[],
  context: RecordContext,
): TrajectoryRecord {
  const first = events[0]!;
  if (first.eventType === "subagent/created") {
    const ended = events.findLast(
      (event) => event.eventType === "subagent/settled",
    );
    const description = stringValue(first.payload.description);
    const childId = stringValue(first.payload.child_session_id);
    if (
      description === null ||
      childId === null ||
      typeof first.payload.prompt !== "string"
    )
      throw new Error("Invalid delegation record.");
    const started = events.findLast(event => event.eventType === "subagent/started");
    const completed = ended !== undefined && (
      started === undefined || (
        ended.sequence > started.sequence &&
        ended.payload.child_run_id === started.payload.child_run_id
      )
    );
    const status = completed ? stringValue(ended.payload.status) : "pending";
    if (status === null) throw new Error("Invalid delegation settlement.");
    return baseRecord(events, {
      turn: turnFor(first, context),
      text: `${zhCN.subagents.title} · ${description}`,
      searchText: `${description} ${first.payload.prompt} ${safeString(ended?.payload.output ?? "")}`,
      status,
      startedAt: first.occurredAt,
      completedAt: completed ? ended.occurredAt : null,
      isError: status === "failed",
      source: {
        kind: "subagent",
        child_id: childId,
        parent_run_id: first.payload.owner_run_id,
        tool_call_id: first.payload.tool_call_id,
        model_snapshot: first.payload.model_snapshot,
        permission: first.payload.permission,
      },
      input: first.payload.prompt,
      output: completed ? ended.payload : null,
    });
  }
  if (first.eventType === "compaction/start") {
    const ended = events.find((event) => event.eventType === "compaction/end");
    const selection = events.find(
      (event) => event.eventType === "compaction/selection",
    );
    const trigger = first.payload.trigger;
    if (
      trigger !== "manual" &&
      trigger !== "pressure" &&
      trigger !== "context-overflow"
    )
      throw new Error("Invalid compaction trigger.");
    const label = zhCN.trajectory.compaction[trigger];
    const owner = stringValue(first.payload.owner_run_id);
    const output = ended?.payload ?? null;
    const usage = output?.usage;
    const checkpoint =
      output === null ? "" : contentText(parseContentBlocks(output.blocks));
    const status = stringValue(output?.outcome) ?? "running";
    const record = baseRecord(events, {
      turn: owner === null ? null : (context.runTurns.get(owner) ?? null),
      text: label,
      searchText: `${label} ${checkpoint}`,
      status,
      startedAt: first.occurredAt,
      completedAt: ended?.occurredAt ?? null,
      isError: ended !== undefined && status !== "completed",
      source: {
        kind: "compaction",
        trigger: first.payload.trigger,
        owner_run_id: first.payload.owner_run_id,
        pressure: first.payload.pressure,
        source_run_id: first.payload.source_run_id,
        through_sequence: first.payload.through_sequence,
        request_sequence: first.payload.request_sequence,
        selection: selection?.payload ?? null,
      },
      input: first.payload.messages,
      output: output === null ? null : { ...output, stream_origin: "model" },
      usage:
        typeof usage === "object" && usage !== null
          ? {
              inputTokens: tokenCount(
                (usage as Record<string, unknown>).input_tokens,
              ),
              outputTokens: tokenCount(
                (usage as Record<string, unknown>).output_tokens,
              ),
              totalTokens: tokenCount(
                (usage as Record<string, unknown>).total_tokens,
              ),
            }
          : null,
    });
    return {
      ...record,
      prompt: {
        system:
          first.payload.messages instanceof Array
            ? first.payload.messages
                .filter((message) => message.role === "system")
                .map((message) =>
                  contentText(parseContentBlocks(message.content)),
                )
                .join("\n\n")
            : "",
        tools: first.payload.tools as readonly unknown[],
        model: first.payload.model_snapshot as Readonly<
          Record<string, unknown>
        >,
      },
    };
  }
  if (first.eventType === "question.requested") {
    const resolved = events.find(
      (event) => event.eventType === "question.resolved",
    );
    const request = first.payload.request;
    if (
      typeof request !== "object" ||
      request === null ||
      !("questions" in request) ||
      !Array.isArray(request.questions)
    )
      throw new Error("Invalid human-question record.");
    const status = stringValue(resolved?.payload.decision) ?? "waiting_input";
    const text = request.questions.map((item) => item.question).join(" · ");
    return baseRecord(events, {
      turn: turnFor(first, context),
      text,
      searchText: `${text} ${safeString(request)} ${safeString(resolved?.payload.answer ?? null)}`,
      status,
      startedAt: first.occurredAt,
      completedAt: resolved?.occurredAt ?? null,
      isError: false,
      source: {
        kind: "question",
        question_id: first.entityId,
        tool_call_id: first.payload.tool_call_id,
        run_id: first.runId,
      },
      input: sanitizeTrajectoryValue(request),
      output:
        resolved === undefined
          ? null
          : sanitizeTrajectoryValue(resolved.payload),
    });
  }
  if (first.eventType === "llm/retry") {
    const started = events.find(
      (event) => event.eventType === "llm/retry-started",
    );
    const run =
      first.runId === null ? undefined : context.runs.get(first.runId);
    const active =
      run?.state === "model_running" &&
      run.step === first.payload.step &&
      run.attempt === first.payload.attempt;
    const text = zhCN.conversation.modelRetry.scheduled(
      Number(first.payload.retry),
      Number(first.payload.delay_ms),
    );
    return baseRecord(events, {
      turn: turnFor(first, context),
      text,
      searchText: `${text} ${safeString(first.payload.failure)} ${String(first.payload.provider)}`,
      status:
        started === undefined
          ? active
            ? "pending"
            : "cancelled"
          : "completed",
      completedAt: started?.occurredAt ?? null,
      startedAt: first.occurredAt,
      isError: false,
      source: {
        kind: "model-retry",
        retry_id: first.payload.retry_id,
        provider: first.payload.provider,
        policy_key: first.payload.policy_key,
        step: first.payload.step,
        attempt: first.payload.attempt,
      },
      input: first.payload,
      output: started?.payload ?? null,
    });
  }
  if (first.eventType === "image/offload") {
    if (!Array.isArray(first.payload.targets))
      throw new Error("Invalid image offload record.");
    const count = first.payload.targets.reduce(
      (sum: number, target: { image_indexes: unknown[] }) =>
        sum + target.image_indexes.length,
      0,
    );
    const text = zhCN.conversation.attachments.offloadSummary(count);
    const header = [...context.allEvents]
      .reverse()
      .find(
        (event) =>
          event.eventType === "request.header" &&
          event.sequence < first.sequence,
      );
    return baseRecord(events, {
      turn: header === undefined ? null : turnFor(header, context),
      text,
      searchText: `${text} ${safeString(first.payload.targets)}`,
      status: "completed",
      startedAt: first.occurredAt,
      completedAt: first.occurredAt,
      isError: false,
      source: {
        kind: "context",
        producer: "image/offload",
        run_id: header?.runId ?? null,
        request_sequence: header?.sequence ?? null,
      },
      input: first.payload,
      output: null,
    });
  }
  const done = events.find((event) => event.eventType === "command/done");
  const isCommand = first.eventType === "command/run";
  const content =
    first.eventType === "todo/write"
      ? `${zhCN.conversation.tools.names.todo_write} ${safeString(first.payload.todos)}`
      : isCommand
        ? `/${String(first.payload.name)}${stringValue(first.payload.raw_input) ?? ""}`
        : (stringValue(first.payload.content) ??
          stringValue(first.payload.summary) ??
          stringValue(first.payload.text) ??
          `${first.eventType} ${safeString(first.payload)}`);
  const output = isCommand ? stringValue(done?.payload.text) : null;
  return baseRecord(events, {
    turn: turnFor(first, context),
    text: content,
    searchText: `${content} ${output ?? ""}`,
    status:
      isCommand && done === undefined
        ? "running"
        : done?.payload.kind === "error"
          ? "failed"
          : "completed",
    completedAt: isCommand ? (done?.occurredAt ?? null) : first.occurredAt,
    startedAt: first.occurredAt,
    isError: done?.payload.kind === "error",
    source: isCommand
      ? {
          kind: "command",
          command_id: first.entityId,
          definition_id: first.payload.definition_id,
          source_event_sequence: done?.payload.source_event_sequence ?? null,
        }
      : {
          kind: "context",
          producer: first.payload.producer ?? first.eventType,
          metadata: first.payload.metadata,
          session_id: first.payload.session_id ?? null,
        },
    input:
      isCommand || first.eventType === "context.injected"
        ? content
        : first.payload,
    output,
  });
}

export function systemRecord(
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
