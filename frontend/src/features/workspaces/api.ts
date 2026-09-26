import { requestJson } from "@/api/client";

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface SessionSummary {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export const workspaceQueryKeys = {
  all: ["workspaces"] as const,
  sessions: (workspaceId: string) =>
    ["workspaces", workspaceId, "sessions"] as const
};

export function listWorkspaces(): Promise<Workspace[]> {
  return requestJson<Workspace[]>("/api/v1/workspaces");
}

export function createWorkspace(name: string): Promise<Workspace> {
  return requestJson<Workspace>("/api/v1/workspaces", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export function listSessions(
  workspaceId: string
): Promise<SessionSummary[]> {
  return requestJson<SessionSummary[]>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions`
  );
}

export function createSession(
  workspaceId: string,
  title: string
): Promise<SessionSummary> {
  return requestJson<SessionSummary>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions`,
    {
      method: "POST",
      body: JSON.stringify({ title })
    }
  );
}
