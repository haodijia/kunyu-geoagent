import { requestJson } from "@/api/client";

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
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly status: "pending" | "running" | "completed" | "failed" | "cancelled";
  readonly result: unknown;
  readonly error_code: string | null;
  readonly error_summary: string | null;
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
  readonly model_snapshot: {
    readonly connection_id: string;
    readonly model_id: string;
    readonly reasoning_effort: string | null;
  };
  readonly map_context: Readonly<Record<string, unknown>>;
  readonly scene: Readonly<Record<string, unknown>> | null;
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
