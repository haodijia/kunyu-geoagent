import { requestJson } from "@/api/client";

export interface SessionSummary {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly archived: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export const sessionQueryKeys = {
  archived: ["sessions", "archived"] as const,
  detail: (sessionId: string) => ["sessions", sessionId] as const
};

export function getSession(sessionId: string): Promise<SessionSummary> {
  return requestJson<SessionSummary>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}`
  );
}

export function setSessionArchived(
  sessionId: string,
  archived: boolean
): Promise<SessionSummary> {
  return requestJson(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/archive`,
    {
      method: "POST",
      body: JSON.stringify({ archived })
    }
  );
}
