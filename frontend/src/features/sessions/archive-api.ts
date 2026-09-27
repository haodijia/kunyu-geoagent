import { requestJson } from "@/api/client";
import { setSessionArchived, type SessionSummary } from "./api";

export interface ArchivedSessionPage {
  readonly items: SessionSummary[];
  readonly has_more: boolean;
  readonly next_cursor: string | null;
}

export interface ArchivedWorkspace extends ArchivedSessionPage {
  readonly workspace_id: string;
  readonly workspace_name: string;
}

export const archivedSessionApi = {
  list: (limit: number) =>
    requestJson<ArchivedWorkspace[]>(
      `/api/v1/sessions/archived?limit=${limit}`
    ),
  page: ({
    workspaceId,
    cursor,
    limit
  }: {
    workspaceId: string;
    cursor: string;
    limit: number;
  }) =>
    requestJson<ArchivedSessionPage>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/archived-sessions?${new URLSearchParams({ cursor, limit: String(limit) })}`
    ),
  restore: (id: string) => setSessionArchived(id, false),
  deleteItem: (id: string) =>
    requestJson<void>(`/api/v1/sessions/${encodeURIComponent(id)}/archived`, {
      method: "DELETE"
    }),
  deleteWorkspace: (id: string) =>
    requestJson<{ session_count: number }>(
      `/api/v1/workspaces/${encodeURIComponent(id)}/archived-sessions`,
      { method: "DELETE" }
    )
};
