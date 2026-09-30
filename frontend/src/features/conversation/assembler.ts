import type { AgentTurn } from "@/features/agent/api";
import type { Confirmation } from "@/features/confirmations/api";
import type { TrajectoryEventProjection } from "@/features/events/projection";
import { buildTrajectoryRecords } from "@/features/events/trajectory-records";
import type { TrajectoryRecord } from "@/features/events/trajectory-model";
import type { SessionMessage } from "@/features/messages/api";

export interface ConversationSource {
  readonly confirmations: readonly Confirmation[];
  readonly events: readonly TrajectoryEventProjection[];
  readonly messages: readonly SessionMessage[];
  readonly turns: readonly AgentTurn[];
}

export interface ChatSnapshot {
  readonly target: "chat";
  readonly confirmations: readonly Confirmation[];
  readonly messages: readonly SessionMessage[];
  readonly turns: readonly AgentTurn[];
}

export interface TrajectorySnapshot {
  readonly target: "trajectory";
  readonly records: readonly TrajectoryRecord[];
}

class ConversationAssembler {
  assemble(target: "chat", source: ConversationSource): ChatSnapshot;
  assemble(target: "trajectory", source: ConversationSource): TrajectorySnapshot;
  assemble(
    target: "chat" | "trajectory",
    source: ConversationSource
  ): ChatSnapshot | TrajectorySnapshot {
    if (target === "chat") {
      return {
        target,
        confirmations: source.confirmations,
        messages: source.messages,
        turns: source.turns
      };
    }
    return {
      target,
      records: buildTrajectoryRecords(
        source.events,
        source.messages,
        source.turns,
        source.confirmations
      )
    };
  }
}

export const conversationAssembler = new ConversationAssembler();
