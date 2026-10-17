import { useMessages } from "@/features/messages/state/useMessages";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

const Context = createContext<ReturnType<typeof useMessages> | null>(null);

export function SessionMessagesProvider({
  sessionId,
  workspaceId,
  children,
}: {
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly children: ReactNode;
}) {
  const state = useMessages(sessionId, workspaceId);
  return <Context value={state}>{children}</Context>;
}

export function useSessionMessages() {
  const state = useContext(Context);
  if (state === null) throw new Error("SessionMessagesProvider is required.");
  return state;
}
