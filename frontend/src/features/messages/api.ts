import { requestJson } from "@/api/client";

export type MessageStatus =
  | "streaming"
  | "completed"
  | "interrupted"
  | "failed"
  | "cancelled";

export interface SessionMessage {
  readonly id: string;
  readonly session_id: string;
  readonly sequence: number;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly run_id: string | null;
  readonly step: number | null;
  readonly attempt: number | null;
  readonly status: MessageStatus;
  readonly content_length: number;
  readonly updated_sequence: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export const messageQueryKeys = {
  session: (sessionId: string) => ["sessions", sessionId, "messages"] as const
};

export function listMessages(sessionId: string): Promise<SessionMessage[]> {
  return requestJson<SessionMessage[]>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/messages`
  );
}

export function appendUserMessage(
  sessionId: string,
  content: string
): Promise<SessionMessage> {
  return requestJson<SessionMessage>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ role: "user", content })
    }
  );
}
