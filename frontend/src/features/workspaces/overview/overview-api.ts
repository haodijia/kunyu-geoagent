import { requestJson } from "@/api/client";

export interface WorkspaceMetrics {
  sessions: number;
  runs: number;
  completed: number;
  failed: number;
  active: number;
  cancelled: number;
  model_calls: number;
  tool_calls: number;
  total_tokens: number | null;
  token_reported_runs: number;
  activity: readonly { day: string; runs: number; completed: number }[];
}
export interface WorkspaceMemory {
  id: string;
  content: string;
  created_at: string;
}
export interface WorkspaceOverviewData {
  metrics: WorkspaceMetrics;
  memories: readonly WorkspaceMemory[];
  memory_count: number;
}
export const overviewKey = (id: string) => ["workspace-overview", id] as const;
export const getOverview = (id: string, signal: AbortSignal) =>
  requestJson<WorkspaceOverviewData>(
    `/api/v1/workspaces/${encodeURIComponent(id)}/overview`,
    { signal },
  );

export interface InstructionDocument {
  content: string;
  version: string | null;
}
const workspacePath = (id: string) =>
  `/api/v1/workspaces/${encodeURIComponent(id)}`;
export const instructionKey = (id: string) =>
  ["workspace-instructions", id] as const;
export const getInstructions = (id: string, signal: AbortSignal) =>
  requestJson<InstructionDocument>(`${workspacePath(id)}/instructions`, {
    signal,
  });
export const saveInstructions = (id: string, document: InstructionDocument) =>
  requestJson<InstructionDocument>(`${workspacePath(id)}/instructions`, {
    method: "PUT",
    body: JSON.stringify(document),
  });
export const saveMemory = (
  workspaceId: string,
  content: string,
  memory: WorkspaceMemory | null,
) =>
  requestJson<WorkspaceMemory>(
    `${workspacePath(workspaceId)}/memories${memory === null ? "" : `/${encodeURIComponent(memory.id)}`}`,
    {
      method: memory === null ? "POST" : "PATCH",
      body: JSON.stringify(
        memory === null
          ? { content }
          : { content, expected_content: memory.content },
      ),
    },
  );
