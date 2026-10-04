import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { workspaceFilePath } from "./file-path";

export type PreviewTab = { readonly id: string; readonly path: string; readonly revision: number } & (
  { readonly kind: "file"; readonly line?: number } | { readonly kind: "diff"; readonly toolId: string }
);
interface PreviewState { readonly tabs: readonly PreviewTab[]; readonly activeId: string | null; readonly width: number; }
interface PreviewActions extends PreviewState {
  readonly maximized: boolean;
  openFile(path: string, line?: number): void;
  openDiff(toolId: string, path: string): void;
  select(id: string): void;
  closeTab(id: string): void;
  closePanel(): void;
  resize(width: number): void;
  toggleMaximized(): void;
  refresh(): void;
}
const PreviewContext = createContext<PreviewActions | null>(null);

function readState(key: string): PreviewState {
  const stored = sessionStorage.getItem(key);
  if (stored === null) return { tabs: [], activeId: null, width: 50 };
  const state = JSON.parse(stored) as PreviewState;
  if (!Array.isArray(state.tabs) || !(state.activeId === null || typeof state.activeId === "string")
    || !Number.isFinite(state.width) || state.width < 20 || state.width > 80
    || state.tabs.some(tab => typeof tab.path !== "string" || typeof tab.id !== "string" || !Number.isSafeInteger(tab.revision)
      || !(tab.kind === "file" ? tab.id === `file:${tab.path}` && (tab.line === undefined || (Number.isSafeInteger(tab.line) && tab.line >= 1)) : tab.kind === "diff" && typeof tab.toolId === "string" && tab.id === `diff:${tab.toolId}`))
    || new Set(state.tabs.map(tab => tab.id)).size !== state.tabs.length
    || (state.activeId !== null && !state.tabs.some(tab => tab.id === state.activeId))) throw new Error("Invalid persisted file preview state.");
  return state;
}

export function FilePreviewProvider({ sessionId, children }: { readonly sessionId: string; readonly children: ReactNode }) {
  const key = `kunyu:file-preview:${sessionId}`;
  const [state, setState] = useState(() => readState(key));
  const [maximized, setMaximized] = useState(false);
  useEffect(() => { sessionStorage.setItem(key, JSON.stringify(state)); }, [key, state]);
  const open = (tab: PreviewTab) => setState(current => {
    const index = current.tabs.findIndex(item => item.id === tab.id);
    const tabs = [...current.tabs];
    if (index === -1) tabs.push(tab);
    else tabs[index] = { ...tab, revision: tabs[index]!.revision + 1 };
    return { ...current, tabs, activeId: tab.id };
  });
  return <PreviewContext value={{ ...state, maximized,
    openFile: (path, line) => { const normalized = workspaceFilePath(path); open({ kind: "file", id: `file:${normalized}`, path: normalized, line, revision: 0 }); },
    openDiff: (toolId, path) => open({ kind: "diff", id: `diff:${toolId}`, path, toolId, revision: 0 }),
    select: activeId => setState(current => ({ ...current, activeId })),
    closeTab: id => setState(current => { const index = current.tabs.findIndex(tab => tab.id === id); const tabs = current.tabs.filter(tab => tab.id !== id); return { ...current, tabs, activeId: current.activeId !== id ? current.activeId : tabs[Math.min(index, tabs.length - 1)]?.id ?? null }; }),
    closePanel: () => setState(current => ({ ...current, activeId: null })),
    resize: width => setState(current => ({ ...current, width: Math.max(20, Math.min(80, width)) })),
    toggleMaximized: () => setMaximized(current => !current),
    refresh: () => setState(current => ({ ...current, tabs: current.tabs.map(tab => tab.id === current.activeId ? { ...tab, revision: tab.revision + 1 } : tab) })),
  }}>{children}</PreviewContext>;
}

export function useFilePreview(): PreviewActions {
  const context = useContext(PreviewContext);
  if (context === null) throw new Error("File preview requires a session provider.");
  return context;
}
