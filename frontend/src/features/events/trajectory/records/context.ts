import type { AgentTurn, ToolCall } from "@/features/agent/api";
import type { Confirmation } from "@/features/confirmations/api";
import type { TrajectoryEventProjection } from "@/features/events/projection/events";
import type { ActiveAssistant } from "@/features/events/stream/live-assistant";
import type { SessionMessage } from "@/features/messages/api";

export interface RecordContext {
  readonly activeAssistant: ActiveAssistant | null;
  readonly allEvents: readonly TrajectoryEventProjection[];
  readonly messages: ReadonlyMap<string, SessionMessage>;
  readonly runs: ReadonlyMap<string, AgentTurn>;
  readonly tools: ReadonlyMap<string, ToolCall>;
  readonly confirmations: ReadonlyMap<string, Confirmation>;
  readonly runTurns: ReadonlyMap<string, number>;
  readonly messageTurns: ReadonlyMap<string, number>;
}
