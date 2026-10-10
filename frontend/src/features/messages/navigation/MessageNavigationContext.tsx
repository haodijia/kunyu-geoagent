import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionMessages } from "../SessionMessagesContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { sessionAnalysisPath } from "@/features/sessions/routes";
import { buildMessageAnchors, type MessageAnchor } from "./model";

interface Navigation {
  readonly anchors: readonly MessageAnchor[];
  readonly loading: boolean;
  readonly error: Error | null;
  readonly searchOpen: boolean;
  readonly setSearchOpen: (value: boolean) => void;
  readonly pendingJump: { readonly id: number; readonly messageId: string } | null;
  readonly jump: (messageId: string) => void;
  readonly acknowledge: (id: number) => void;
  readonly retry: () => void;
}
const NavigationContext = createContext<Navigation | null>(null);

export function MessageNavigationProvider({ children }: { readonly children: ReactNode }) {
  const session = useSessionWorkspace(), navigate = useNavigate();
  const { messagesQuery } = useSessionMessages();
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingJump, setPendingJump] = useState<Navigation["pendingJump"]>(null);
  const nextId = useRef(0);
  const anchors = useMemo(() => messagesQuery.data === undefined ? [] : buildMessageAnchors(messagesQuery.data), [messagesQuery.data]);
  const value: Navigation = {
    anchors, loading: messagesQuery.isPending, error: messagesQuery.error, searchOpen, setSearchOpen, pendingJump,
    jump: (messageId) => {
      if (!anchors.some((anchor) => anchor.messageId === messageId)) throw new Error("The message anchor does not belong to this session.");
      setPendingJump({ id: ++nextId.current, messageId });
      setSearchOpen(false);
      void navigate(sessionAnalysisPath(session.workspace_id, session.id, "conversation"));
    },
    acknowledge: (id) => setPendingJump((current) => current?.id === id ? null : current),
    retry: () => { void messagesQuery.refetch(); },
  };
  return <NavigationContext value={value}>{children}</NavigationContext>;
}

export function useMessageNavigation(): Navigation {
  const context = useContext(NavigationContext);
  if (context === null) throw new Error("Message navigation requires its session provider.");
  return context;
}
