import { createContext, useContext, type ReactNode } from "react";

import type { SessionSummary } from "@/features/sessions/api";

const SessionWorkspaceContext = createContext<SessionSummary | null>(null);

interface SessionWorkspaceProviderProps {
  readonly children: ReactNode;
  readonly session: SessionSummary;
}

export function SessionWorkspaceProvider({
  children,
  session
}: SessionWorkspaceProviderProps) {
  return (
    <SessionWorkspaceContext value={session}>
      {children}
    </SessionWorkspaceContext>
  );
}

export function useSessionWorkspace(): SessionSummary {
  const session = useContext(SessionWorkspaceContext);
  if (session === null) {
    throw new Error(
      "useSessionWorkspace must be used inside SessionWorkspaceProvider."
    );
  }
  return session;
}
