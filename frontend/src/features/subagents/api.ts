import { requestJson } from "@/api/client";
import type { AgentTurnState, StepModelSnapshot } from "@/features/agent/api";

export interface Subagent {
  readonly child_id: string;
  readonly parent_run_id: string;
  readonly tool_call_id: string;
  readonly description: string;
  readonly prompt: string;
  readonly permission: "read-only";
  readonly model_snapshot: StepModelSnapshot;
  readonly status: AgentTurnState | "queued";
  readonly output: string | null;
  readonly reason: string | null;
  readonly active_tool: string | null;
  readonly step: number | null;
  readonly created_at: string;
  readonly settled_at: string | null;
  readonly created_sequence: number;
  readonly settled_sequence: number | null;
}

export const subagentKeys = {
  list: (parent: string) => ["sessions", parent, "subagents"] as const,
  detail: (parent: string, child: string) =>
    ["sessions", parent, "subagents", child] as const,
};
const route = (parent: string) =>
  `/api/v1/sessions/${encodeURIComponent(parent)}/subagents`;
export const listSubagents = (parent: string, signal?: AbortSignal) =>
  requestJson<Subagent[]>(route(parent), { signal });
export const getSubagent = (
  parent: string,
  child: string,
  signal?: AbortSignal,
) =>
  requestJson<Subagent>(`${route(parent)}/${encodeURIComponent(child)}`, {
    signal,
  });
export const cancelSubagent = (parent: string, child: string) =>
  requestJson<Subagent>(
    `${route(parent)}/${encodeURIComponent(child)}/cancel`,
    { method: "POST", body: "{}" },
  );
