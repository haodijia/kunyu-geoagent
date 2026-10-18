import { parseToolContent } from "@/features/agent/tools/tool-content";
import { toolStatus } from "@/features/agent/tools/tool-presentation";
import type { TrajectoryEventProjection } from "@/features/events/projection/events";
import type { RecordContext } from "@/features/events/trajectory/records/context";
import {
  baseRecord,
  safeString,
  statusLabel,
  stringValue,
  turnFor,
} from "@/features/events/trajectory/records/shared";
import type { TrajectoryRecord } from "@/features/events/trajectory/trajectory-model";
import { sanitizeTrajectoryValue } from "@/features/events/trajectory/trajectory-sanitize";
import { zhCN } from "@/locales/zh-CN";

export function toolRecord(
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
  const confirmation = [...context.confirmations.values()].find(
    (item) => item.tool_call_id === first.entityId,
  );
  const run = first.runId === null ? undefined : context.runs.get(first.runId);
  const status =
    snapshot === undefined
      ? (terminal?.eventType.replace("tool.", "") ?? "pending")
      : toolStatus(
          snapshot,
          run?.state ?? null,
          confirmation,
          context.allEvents,
        );
  const input = sanitizeTrajectoryValue(
    snapshot?.arguments ?? requested?.payload.arguments ?? {},
  );
  const completed =
    terminal?.eventType === "tool.completed"
      ? terminal.payload
      : snapshot?.status === "completed"
        ? snapshot
        : null;
  const output = sanitizeTrajectoryValue(
    completed !== null
      ? {
          result: completed.result,
          content: parseToolContent(completed.content),
          display: completed.display,
          compact: completed.compact,
        }
      : snapshot?.error_summary !== null &&
          snapshot?.error_summary !== undefined
        ? {
            error_code: snapshot.error_code,
            error_summary: snapshot.error_summary,
          }
        : terminal?.eventType === "tool.failed"
          ? {
              error_code: terminal.payload.error_code,
              error_summary: terminal.payload.error_summary,
            }
          : null,
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

export function confirmationRecord(
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

function toolLabel(name: string): string {
  const names = zhCN.conversation.tools.names as Readonly<
    Record<string, string>
  >;
  return names[name] ?? name;
}
