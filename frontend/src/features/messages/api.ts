import { requestJson } from "@/api/client";

export interface UserMessage {
  readonly id: string;
  readonly session_id: string;
  readonly sequence: number;
  readonly role: "user";
  readonly content: string;
  readonly created_at: string;
}

export const messageQueryKeys = {
  session: (sessionId: string) => ["sessions", sessionId, "messages"] as const
};

export function listMessages(sessionId: string): Promise<UserMessage[]> {
  return requestJson<UserMessage[]>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/messages`
  );
}

export function appendUserMessage(
  sessionId: string,
  content: string
): Promise<UserMessage> {
  return requestJson<UserMessage>(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ role: "user", content })
    }
  );
}
