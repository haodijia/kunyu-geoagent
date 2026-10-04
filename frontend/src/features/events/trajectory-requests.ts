import { contentText, parseContentBlocks } from "./content-blocks";
import { zhCN } from "@/locales/zh-CN";
import type { TrajectoryEventProjection } from "./projection";
import type { TrajectoryRecord, TrajectoryPrompt } from "./trajectory-model";
import { sanitizeTrajectoryValue } from "./trajectory-sanitize";

/** Interpret request snapshots as prompt changes and sourced context, as in harness. */
export function attachRequestDetails(
  records: readonly TrajectoryRecord[],
  headers: readonly TrajectoryEventProjection[],
): TrajectoryRecord[] {
  const byMessage = new Map(
    headers.map((header) => [header.payload.message_id, header]),
  );
  const bySequence = new Map(
    headers.map((header) => [header.sequence, header]),
  );
  let previousPrompt: TrajectoryPrompt | undefined;
  const contexts = new Map<string, string>();
  const result: TrajectoryRecord[] = [];
  for (const record of records) {
    if (record.kind !== "system") {
      const header = byMessage.get(record.source.message_id);
      const prompt = header === undefined ? undefined : promptFrom(header);
      const schema = prompt?.tools.find(
        (tool) => isObject(tool) && tool.name === record.source.tool_name,
      );
      result.push({
        ...record,
        ...(prompt === undefined ? {} : { prompt }),
        ...(schema === undefined ? {} : { schema }),
        ...(record.kind === "assistant" && header !== undefined
          ? { index: header.sequence + 0.5 }
          : {}),
      });
      continue;
    }
    const header = bySequence.get(record.index)!;
    const prompt = promptFrom(header);
    const changed =
      previousPrompt === undefined ||
      JSON.stringify(previousPrompt) !== JSON.stringify(prompt);
    result.push({
      ...record,
      index: previousPrompt === undefined ? 0 : record.index,
      turn: previousPrompt === undefined ? null : record.turn,
      text:
        previousPrompt === undefined
          ? zhCN.trajectory.initialPrompt
          : zhCN.trajectory.updatedPrompt,
      requestOnly: !changed,
      prompt,
      ...(previousPrompt === undefined ? {} : { previousPrompt }),
    });
    previousPrompt = prompt;
    const messages = header.payload.messages;
    if (!Array.isArray(messages))
      throw new Error(
        zhCN.trajectory.invalidProjection(header.eventType, "messages"),
      );
    messages.forEach((message, index) => {
      if (
        !isObject(message) ||
        !isObject(message.source) ||
        message.source.kind !== "context" ||
        ["injected", "skill-catalog", "skill-invocation"].includes(
          String(message.source.producer),
        )
      )
        return;
      const producer = String(message.source.producer);
      const text = sanitizeTrajectoryValue(
        contentText(parseContentBlocks(message.content)),
      ) as string;
      if (contexts.get(producer) === text) return;
      contexts.set(producer, text);
      result.push({
        ...record,
        id: `context:${header.id}:${index}`,
        index: header.sequence + (index + 1) / 1000,
        kind: "context",
        text,
        searchText: text,
        input: text,
        output: null,
        source: {
          kind: "context",
          producer,
          run_id: header.runId,
          step: header.payload.step,
          attempt: header.payload.attempt,
        },
        raw: sanitizeTrajectoryValue(message) as Readonly<
          Record<string, unknown>
        >,
      });
    });
  }
  return result.sort((left, right) => left.index - right.index);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function promptFrom(event: TrajectoryEventProjection): TrajectoryPrompt {
  return {
    system: sanitizeTrajectoryValue(event.payload.system_prompt) as string,
    tools: sanitizeTrajectoryValue(event.payload.tools) as readonly unknown[],
    model: {
      model_id: event.payload.model_id,
      reasoning_effort: event.payload.reasoning_effort,
      max_output_tokens: event.payload.max_output_tokens,
    },
  };
}
