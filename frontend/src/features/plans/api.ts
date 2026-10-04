import { requestJson } from "@/api/client";

export interface SubmittedPlan {
  readonly tool_call_id: string;
  readonly title: string;
  readonly markdown: string;
}
export const planQueryKeys = {
  document: (sessionId: string, toolId: string) =>
    ["sessions", sessionId, "plans", toolId] as const,
};
export const getPlan = (sessionId: string, toolId: string) =>
  requestJson<SubmittedPlan>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/plans/${encodeURIComponent(toolId)}`,
  );
