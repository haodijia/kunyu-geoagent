import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

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

const desktopFiles = window.matchMedia("(min-width: 768px)");
function subscribeViewport(notify: () => void) { desktopFiles.addEventListener("change", notify); return () => desktopFiles.removeEventListener("change", notify); }
const desktopViewport = () => desktopFiles.matches;

export function FileExplorerProvider({ workspaceId, children }: { readonly workspaceId: string; readonly children: ReactNode }) {
  const wide = useSyncExternalStore(subscribeViewport, desktopViewport);
  const key = `kunyu:files:${workspaceId}`;
  const [state, setState] = useState(() => readState(key));
  const [populated, setPopulated] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const showWhenPopulated = useCallback(() => setPopulated(true), []);
  useEffect(() => { localStorage.setItem(key, JSON.stringify(state)); }, [key, state]);
  return <ExplorerContext value={{ ...state, open: state.preference ?? (populated && wide), selected,
    togglePanel: () => setState(current => ({ ...current, preference: !(current.preference ?? (populated && wide)) })),
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
