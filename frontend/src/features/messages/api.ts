import { requestJson } from "@/api/client";
import type { MapContext } from "@/features/sessions/map-context";
import type { AgentTurn } from "@/features/agent/api";

export type MessageStatus =
  | "streaming"
  | "completed"
  | "interrupted"
  | "failed"
  | "cancelled";

export interface SessionMessage {
  readonly id: string;
  readonly session_id: string;
  readonly sequence: number;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly run_id: string | null;
  readonly step: number | null;
  readonly attempt: number | null;
  readonly status: MessageStatus;
  readonly content_length: number;
  readonly updated_sequence: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export const messageQueryKeys = {
  session: (sessionId: string) => ["sessions", sessionId, "messages"] as const
};

export function listMessages(
  sessionId: string,
  signal?: AbortSignal
): Promise<SessionMessage[]> {
  return requestJson<SessionMessage[]>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
    { signal }
  );
}

export function appendUserMessage(
  sessionId: string,
  idempotencyKey: string,
  input: {
    readonly content: string;
    readonly connectionId: string;
    readonly modelId: string;
    readonly reasoningEffort: string | null;
    readonly mapContext: MapContext;
  }
): Promise<AcceptedMessage> {
  const map = input.mapContext;
  return requestJson<AcceptedMessage>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        content: input.content,
        model_selection: {
          connection_id: input.connectionId,
          model_id: input.modelId,
          reasoning_effort: input.reasoningEffort
        },
        map_context: {
          workspace_id: map.workspaceId,
          viewport: map.viewport,
          event_id: map.eventId,
          selected_aoi_id: map.selectedAoiId,
          selected_feature: map.selectedFeature === null ? null : {
            feature_id: map.selectedFeature.featureId,
            layer_id: map.selectedFeature.layerId
          },
          visible_layer_ids: map.visibleLayerIds,
          active_result_layer_id: map.activeResultLayerId,
          active_observation_id: map.activeObservationId,
          comparison_observation_ids: map.comparisonObservationIds
        }
      })
    }
  );
}

export interface AcceptedMessage {
  readonly message: SessionMessage;
  readonly turn: AgentTurn;
}
