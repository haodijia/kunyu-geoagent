import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { useSessionEvents } from "@/features/events/SessionEventContext";
import { directoryQueryKey } from "./api";

interface ExplorerState {
  readonly preference: boolean | null;
  readonly expanded: readonly string[];
  readonly width: number;
}
interface ExplorerActions extends ExplorerState {
  readonly open: boolean;
  readonly selected: string | null;
  togglePanel(): void;
  closePanel(): void;
  toggleDirectory(path: string): void;
  collapseAll(): void;
  resize(width: number): void;
  select(path: string): void;
  showWhenPopulated(): void;
}
const ExplorerContext = createContext<ExplorerActions | null>(null);

function readState(key: string): ExplorerState {
  const stored = localStorage.getItem(key);
  if (stored === null) return { preference: null, expanded: [], width: 260 };
  const state = JSON.parse(stored) as ExplorerState;
  if (!(state.preference === null || typeof state.preference === "boolean")
    || !Number.isFinite(state.width) || state.width < 220 || state.width > 500
    || !Array.isArray(state.expanded) || state.expanded.some(path => typeof path !== "string" || !path.startsWith("/workspace/") || /\/(?:\.|\.\.)(?:\/|$)|\/\//.test(path))
    || new Set(state.expanded).size !== state.expanded.length) throw new Error("Invalid persisted file explorer state.");
  return state;
}

export function FileExplorerProvider({ sessionId, workspaceId, children }: { readonly sessionId: string; readonly workspaceId: string; readonly children: ReactNode }) {
  const key = `kunyu:files:${workspaceId}`;
  const [state, setState] = useState(() => readState(key));
  const [populated, setPopulated] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const showWhenPopulated = useCallback(() => setPopulated(true), []);
  const queryClient = useQueryClient();
  const { events } = useSessionEvents();
  const sequence = useRef<number | null>(null);
  const mutations = useRef(new Set<string>());
  useEffect(() => { localStorage.setItem(key, JSON.stringify(state)); }, [key, state]);
  useEffect(() => {
    if (events.length === 0) return;
    const current = events.at(-1)!.sequence;
    for (const event of events) {
      if (event.event_type === "tool.requested" && (event.payload.name === "write" || event.payload.name === "edit") && typeof event.payload.tool_call_id === "string") mutations.current.add(event.payload.tool_call_id);
    }
    if (sequence.current !== null && events.some(event => event.sequence > sequence.current! && event.event_type === "tool.completed" && typeof event.payload.tool_call_id === "string" && mutations.current.has(event.payload.tool_call_id))) {
      void queryClient.invalidateQueries({ queryKey: directoryQueryKey(sessionId) });
    }
    for (const event of events) {
      if ((event.event_type === "tool.completed" || event.event_type === "tool.failed") && typeof event.payload.tool_call_id === "string") mutations.current.delete(event.payload.tool_call_id);
    }
    sequence.current = current;
  }, [events, queryClient, sessionId]);
  return <ExplorerContext value={{ ...state, open: state.preference ?? populated, selected,
    togglePanel: () => setState(current => ({ ...current, preference: !(current.preference ?? populated) })),
    closePanel: () => setState(current => ({ ...current, preference: false })),
    toggleDirectory: path => setState(current => ({ ...current, expanded: current.expanded.includes(path) ? current.expanded.filter(value => value !== path && !value.startsWith(path + "/")) : [...current.expanded, path] })),
    collapseAll: () => setState(current => ({ ...current, expanded: [] })),
    resize: width => setState(current => ({ ...current, width: Math.max(220, Math.min(500, width)) })),
    select: setSelected,
    showWhenPopulated,
  }}>{children}</ExplorerContext>;
}

export function useFileExplorer(): ExplorerActions {
  const explorer = useContext(ExplorerContext);
  if (explorer === null) throw new Error("File explorer requires a session provider.");
  return explorer;
}
