import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { workspaceFilePath } from "./file-path";
import type { FileInfo } from "./api";
import { useFileWatch } from "./useFileWatch";

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
  readonly loaded: Readonly<Partial<Record<string, { version: string | null; refreshable: boolean }>>>;
  readonly watchErrors: Readonly<Partial<Record<string, string | null>>>;
  hasUpdate(path: string): boolean;
  recordLoaded(path: string, version: string | null, refreshable: boolean): void;
  recordInfo(path: string, info: FileInfo | null): void;
  recordWatchError(path: string, error: string | null): void;
  registerWatch(path: string, retry: () => void): () => void;
  retryWatch(path: string): void;
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
  const queryClient = useQueryClient();
  const key = `kunyu:file-preview:${sessionId}`;
  const [state, setState] = useState(() => readState(key));
  const [maximized, setMaximized] = useState(false);
  const [loaded, setLoaded] = useState<Partial<Record<string, { version: string | null; refreshable: boolean }>>>({});
  const [infos, setInfos] = useState<Partial<Record<string, FileInfo | null>>>({});
  const [watchErrors, setWatchErrors] = useState<Partial<Record<string, string | null>>>({});
  const retries = useRef(new Map<string, () => void>());
  const recordLoaded = useCallback((path: string, version: string | null, refreshable: boolean) => setLoaded(current => current[path]?.version === version && current[path]?.refreshable === refreshable ? current : { ...current, [path]: { version, refreshable } }), []);
  const recordInfo = useCallback((path: string, info: FileInfo | null) => setInfos(current => current[path]?.version === info?.version && current[path] !== undefined ? current : { ...current, [path]: info }), []);
  const recordWatchError = useCallback((path: string, error: string | null) => setWatchErrors(current => current[path] === error ? current : { ...current, [path]: error }), []);
  const registerWatch = useCallback((path: string, retry: () => void) => {
    retries.current.set(path, retry);
    return () => {
      retries.current.delete(path);
      setLoaded(current => { const next = { ...current }; delete next[path]; return next; });
      setInfos(current => { const next = { ...current }; delete next[path]; return next; });
      setWatchErrors(current => { const next = { ...current }; delete next[path]; return next; });
    };
  }, []);
  useEffect(() => { sessionStorage.setItem(key, JSON.stringify(state)); }, [key, state]);
  useEffect(() => {
    queryClient.removeQueries({ queryKey: ["file-preview", sessionId], predicate: query => !state.tabs.some(tab => tab.kind === "file" && tab.path === query.queryKey[2] && tab.revision === query.queryKey[3]) });
  }, [queryClient, sessionId, state.tabs]);
  useEffect(() => () => queryClient.removeQueries({ queryKey: ["file-preview", sessionId] }), [queryClient, sessionId]);
  const open = (tab: PreviewTab) => setState(current => {
    const index = current.tabs.findIndex(item => item.id === tab.id);
    const tabs = [...current.tabs];
    if (index === -1) tabs.push(tab);
    else tabs[index] = { ...tab, revision: tabs[index]!.revision + 1 };
    return { ...current, tabs, activeId: tab.id };
  });
  return <PreviewContext value={{ ...state, maximized, loaded, watchErrors, recordLoaded, recordInfo, recordWatchError, registerWatch,
    hasUpdate: path => infos[path] !== undefined && loaded[path]?.version != null && (infos[path] === null || infos[path]!.kind !== "file" || infos[path]!.version !== loaded[path]!.version),
    retryWatch: path => { const retry = retries.current.get(path); if (retry === undefined) throw new Error("The file watch is not registered."); retry(); },
    openFile: (path, line) => { const normalized = workspaceFilePath(path); open({ kind: "file", id: `file:${normalized}`, path: normalized, line, revision: 0 }); },
    openDiff: (toolId, path) => open({ kind: "diff", id: `diff:${toolId}`, path, toolId, revision: 0 }),
    select: activeId => setState(current => ({ ...current, activeId })),
    closeTab: id => setState(current => { const index = current.tabs.findIndex(tab => tab.id === id); const tabs = current.tabs.filter(tab => tab.id !== id); return { ...current, tabs, activeId: current.activeId !== id ? current.activeId : tabs[Math.min(index, tabs.length - 1)]?.id ?? null }; }),
    closePanel: () => setState(current => ({ ...current, activeId: null })),
    resize: width => setState(current => ({ ...current, width: Math.max(20, Math.min(80, width)) })),
    toggleMaximized: () => setMaximized(current => !current),
    refresh: () => setState(current => ({ ...current, tabs: current.tabs.map(tab => tab.id === current.activeId ? { ...tab, revision: tab.revision + 1 } : tab) })),
  }}>{children}{state.tabs.filter(tab => tab.kind === "file" && tab.path.startsWith("/workspace/")).map(tab => <FileTabWatch key={tab.id} sessionId={sessionId} path={tab.path} />)}</PreviewContext>;
}

function FileTabWatch({ sessionId, path }: { readonly sessionId: string; readonly path: string }) {
  const preview = useFilePreview();
  const watch = useFileWatch(sessionId, path, true, frame => preview.recordInfo(path, frame.info));
  useEffect(() => preview.registerWatch(path, watch.retry), [path, watch.retry, preview.registerWatch]);
  useEffect(() => preview.recordWatchError(path, watch.error), [path, watch.error, preview.recordWatchError]);
  return null;
}

export function useFilePreview(): PreviewActions {
  const context = useContext(PreviewContext);
  if (context === null) throw new Error("File preview requires a session provider.");
  return context;
}
