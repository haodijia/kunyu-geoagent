import { requestJson } from "@/api/client";
import type {
  MaxTokensField,
  ModelAuthMode,
  ModelProtocol,
  ModelProviderType
} from "@/features/settings/models/api";

export type RunState =
  | "ready"
  | "model_running"
  | "tool_running"
  | "waiting_confirmation"
  | "interrupted"
  | "completed"
  | "failed"
  | "cancelled";

export interface ToolCall {
  readonly id: string;
  readonly session_id: string;
  readonly run_id: string;
  readonly message_id: string;
  readonly step: number;
  readonly attempt: number;
  readonly provider_call_id: string;
  readonly batch_index: number;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly status: "pending" | "running" | "completed" | "failed" | "cancelled";
  readonly result: unknown;
  readonly error_code: string | null;
  readonly error_summary: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly updated_sequence: number;
}

export interface RunModelSnapshot {
  readonly connection_id: string;
  readonly provider_type: ModelProviderType;
  readonly protocol: ModelProtocol;
  readonly base_url: string;
  readonly auth_mode: ModelAuthMode;
  readonly model_id: string;
  readonly reasoning_effort: string | null;
  readonly connection_revision: number;
  readonly max_tokens_field: MaxTokensField;
  readonly include_usage: boolean;
  readonly max_output_tokens: number;
}

export interface RunMapContext {
  readonly workspace_id: string;
  readonly viewport: {
    readonly latitude: number;
    readonly longitude: number;
    readonly zoom: number;
  };
  readonly event_id: string | null;
  readonly selected_aoi_id: string | null;
  readonly selected_feature: {
    readonly feature_id: string;
    readonly layer_id: string;
  } | null;
  readonly visible_layer_ids: readonly string[];
  readonly active_result_layer_id: string | null;
  readonly active_observation_id: string | null;
  readonly comparison_observation_ids: readonly string[];
}

export interface RunBudget {
  readonly max_model_calls: number;
  readonly model_calls: number;
  readonly max_tool_calls: number;
  readonly tool_calls: number;
  readonly max_active_milliseconds: number;
  readonly active_milliseconds: number;
  readonly max_output_codepoints: number;
  readonly output_codepoints: number;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly total_tokens: number | null;
}

export interface RunSnapshot {
  readonly id: string;
  readonly session_id: string;
  readonly user_message_id: string;
  readonly state: RunState;
  readonly step: number;
  readonly attempt: number;
  readonly resume_phase: "model" | "tool";
  readonly next_tool_index: number;
  readonly requires_resume: boolean;
  readonly queue_sequence: number | null;
  readonly pending_confirmation_id: string | null;
  readonly pause_reason: string | null;
  readonly model_snapshot: RunModelSnapshot;
  readonly map_context: RunMapContext;
  readonly scene: Readonly<Record<string, unknown>> | null;
  readonly budget: RunBudget;
  readonly tool_calls: ToolCall[];
  readonly created_at: string;
  readonly updated_at: string;
  readonly updated_sequence: number;
}

export const runQueryKeys = {
  session: (sessionId: string) => ["sessions", sessionId, "runs"] as const
};

export function listRuns(sessionId: string): Promise<RunSnapshot[]> {
  return requestJson<RunSnapshot[]>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/runs`
  );
}

export function cancelRun(runId: string): Promise<RunSnapshot> {
  return requestJson<RunSnapshot>(`/api/v1/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
    body: "{}"
  });
}

export function resumeRun(runId: string): Promise<RunSnapshot> {
  return requestJson<RunSnapshot>(`/api/v1/runs/${encodeURIComponent(runId)}/resume`, {
    method: "POST",
    body: "{}"
  });
}

export function mergeRunSnapshots(
  current: readonly RunSnapshot[] | undefined,
  incoming: readonly RunSnapshot[]
): RunSnapshot[] {
  if (current === undefined) return [...incoming];
  const merged = new Map(current.map((run) => [run.id, run]));
  for (const run of incoming) {
    const existing = merged.get(run.id);
    if (existing === undefined || run.updated_sequence >= existing.updated_sequence) {
      merged.set(run.id, run);
    }
  }
  return [...merged.values()].sort((left, right) =>
    left.created_at.localeCompare(right.created_at)
  );
}
