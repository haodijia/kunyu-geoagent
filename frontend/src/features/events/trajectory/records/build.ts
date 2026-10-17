import type { AgentTurn } from "@/features/agent/api";
import type { Confirmation } from "@/features/confirmations/api";
import type { TrajectoryEventProjection } from "@/features/events/projection/events";
import type { ActiveAssistant } from "@/features/events/stream/live-assistant";
import type { RecordContext } from "@/features/events/trajectory/records/context";
import {
  contextRecord,
  systemRecord,
} from "@/features/events/trajectory/records/context-record";
import {
  assistantRecord,
  userRecord,
} from "@/features/events/trajectory/records/messages";
import { unsupportedRecord } from "@/features/events/trajectory/records/shared";
import {
  confirmationRecord,
  toolRecord,
} from "@/features/events/trajectory/records/tools";
import type { TrajectoryRecord } from "@/features/events/trajectory/trajectory-model";
import { attachRequestDetails } from "@/features/events/trajectory/trajectory-requests";
import type { SessionMessage } from "@/features/messages/api";

export function buildTrajectoryRecords(
  events: readonly TrajectoryEventProjection[],
  messages: readonly SessionMessage[],
  runs: readonly AgentTurn[] = [],
  confirmations: readonly Confirmation[] = [],
  activeAssistant: ActiveAssistant | null = null,
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
    activeAssistant,
    allEvents: events,
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
