import { requestJson } from "@/api/client";
import type { RunSnapshot, ToolCall } from "@/features/runs/api";

export interface Confirmation {
  readonly id: string;
  readonly session_id: string;
  readonly run_id: string;
  readonly tool_call_id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly summary: string;
  readonly side_effect: string;
  readonly status: "pending" | "approved" | "rejected" | "cancelled";
  readonly decided_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly updated_sequence: number;
}

export interface ConfirmationDecision {
  readonly confirmation: Confirmation;
  readonly tool_call: ToolCall;
  readonly run: RunSnapshot;
  readonly continuation_required: boolean;
}

export const confirmationQueryKeys = {
  session: (sessionId: string) => ["sessions", sessionId, "confirmations"] as const
};

export function listConfirmations(sessionId: string): Promise<Confirmation[]> {
  return requestJson<Confirmation[]>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/confirmations`
  );
}

function decide(
  confirmationId: string,
  decision: "approve" | "reject"
): Promise<ConfirmationDecision> {
  return requestJson<ConfirmationDecision>(
    `/api/v1/confirmations/${encodeURIComponent(confirmationId)}/${decision}`,
    { method: "POST", body: "{}" }
  );
}

export const approveConfirmation = (confirmationId: string) =>
  decide(confirmationId, "approve");

export const rejectConfirmation = (confirmationId: string) =>
  decide(confirmationId, "reject");
