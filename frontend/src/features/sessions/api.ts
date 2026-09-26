import { requestJson } from "@/api/client";

export interface SessionSummary {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export const sessionQueryKeys = {
  detail: (sessionId: string) => ["sessions", sessionId] as const
};

export function getSession(sessionId: string): Promise<SessionSummary> {
  return requestJson<SessionSummary>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}`
  );
}
