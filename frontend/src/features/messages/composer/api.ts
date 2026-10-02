import { requestBlob, requestJson } from "@/api/client";
import { serializeMessageInput, type appendUserMessage } from "@/features/messages/api";
import type { ComposerCommandDescriptor } from "./commands";

export type CommandMessage = Parameters<typeof appendUserMessage>[2];
export type AgentCommandDescriptor = Omit<ComposerCommandDescriptor, "unavailableReason">;

export interface AgentCommandResult {
  readonly kind: "success" | "error";
  readonly text: string;
  readonly source_event_sequence: number | null;
}

export const composerCommandsApi = {
  list: (sessionId: string) => requestJson<AgentCommandDescriptor[]>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/commands`),
  execute: (sessionId: string, commandId: string, line: string, message: CommandMessage | null) =>
    requestJson<AgentCommandResult>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/commands`, {
      method: "POST",
      body: JSON.stringify({ command_id: commandId, line, message: message === null ? null : serializeMessageInput(message) }),
    }),
  export: (sessionId: string) => requestBlob(`/api/v1/sessions/${encodeURIComponent(sessionId)}/commands/export`),
};
