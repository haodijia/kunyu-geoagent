import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { workspaceFilePath } from "./file-path";
import type { FileInfo, FilePreview } from "./api";
import { useFileDrafts, type FileDraft } from "./useFileDrafts";
import { FileEditConfirm, type FileEditAction } from "./FileEditConfirm";
import { useFileWatch } from "./useFileWatch";

export interface PdfView { readonly page: number; readonly zoom: "fit" | number; }
export type PreviewTab = { readonly id: string; readonly path: string; readonly revision: number } & (
  { readonly kind: "file"; readonly line?: number; readonly pdf?: PdfView } | { readonly kind: "diff"; readonly toolId: string }
);
interface PreviewState { readonly tabs: readonly PreviewTab[]; readonly activeId: string | null; readonly width: number; }
interface PreviewActions extends PreviewState {
  readonly maximized: boolean;
  readonly split: boolean;
  setSplit(enabled: boolean): void;
  setPdfView(id: string, view: PdfView): void;
  openFile(path: string, line?: number): void;
  openDiff(toolId: string, path: string): void;
  select(id: string): void;
  closeTab(id: string): void;
  closePanel(): void;
  resize(width: number): void;
  toggleMaximized(): void;
  refresh(): void;
  readonly drafts: Readonly<Partial<Record<string, FileDraft>>>;
  readonly saving: readonly string[];
  readonly saveErrors: Readonly<Partial<Record<string, string>>>;
  readonly storageError: string | null;
  edit(path: string, text: string, base: FilePreview | undefined): void;
  save(id: string): Promise<void>;
  readonly loaded: Readonly<Partial<Record<string, { version: string | null; refreshable: boolean; editable: boolean }>>>;
  readonly watchErrors: Readonly<Partial<Record<string, string | null>>>;
  hasUpdate(path: string): boolean;
  recordLoaded(path: string, version: string | null, refreshable: boolean, editable: boolean): void;
  recordInfo(path: string, info: FileInfo | null): void;
  recordWatchError(path: string, error: string | null): void;
  registerWatch(path: string, retry: () => void): () => void;
  retryWatch(path: string): void;
}
const PreviewContext = createContext<PreviewActions | null>(null);

function validPdfView(value: unknown): value is PdfView {
  if (typeof value !== "object" || value === null || !("page" in value) || !("zoom" in value)) return false;
  return typeof value.page === "number" && Number.isSafeInteger(value.page) && value.page >= 1
    && (value.zoom === "fit" || (typeof value.zoom === "number" && Number.isFinite(value.zoom) && value.zoom >= 25 && value.zoom <= 400));
}

function readState(key: string): PreviewState {
  const stored = sessionStorage.getItem(key);
  if (stored === null) return { tabs: [], activeId: null, width: 50 };
  const state = JSON.parse(stored) as PreviewState;
  if (!Array.isArray(state.tabs) || !(state.activeId === null || typeof state.activeId === "string")
    || !Number.isFinite(state.width) || state.width < 20 || state.width > 80
    || state.tabs.some(tab => typeof tab.path !== "string" || typeof tab.id !== "string" || !Number.isSafeInteger(tab.revision)
      || !(tab.kind === "file" ? tab.id === `file:${tab.path}` && (tab.line === undefined || (Number.isSafeInteger(tab.line) && tab.line >= 1)) && (tab.pdf === undefined || validPdfView(tab.pdf)) : tab.kind === "diff" && typeof tab.toolId === "string" && tab.id === `diff:${tab.toolId}`))
    || new Set(state.tabs.map(tab => tab.id)).size !== state.tabs.length
    || (state.activeId !== null && !state.tabs.some(tab => tab.id === state.activeId))) throw new Error("Invalid persisted file preview state.");
  return state;
}

export function FilePreviewProvider({ sessionId, children }: { readonly sessionId: string; readonly children: ReactNode }) {
  const queryClient = useQueryClient();
  const edits = useFileDrafts(sessionId);
  const [pending, setPending] = useState<FileEditAction | null>(null);
  const key = `kunyu:file-preview:${sessionId}`;
  const [state, setState] = useState(() => readState(key));
  const [maximized, setMaximized] = useState(false);
  const [split, setSplit] = useState(false);
  const [loaded, setLoaded] = useState<Partial<Record<string, { version: string | null; refreshable: boolean; editable: boolean }>>>({});
  const [infos, setInfos] = useState<Partial<Record<string, FileInfo | null>>>({});
  const [watchErrors, setWatchErrors] = useState<Partial<Record<string, string | null>>>({});
  const retries = useRef(new Map<string, () => void>());
  const recordLoaded = useCallback((path: string, version: string | null, refreshable: boolean, editable: boolean) => setLoaded(current => current[path]?.version === version && current[path]?.refreshable === refreshable && current[path]?.editable === editable ? current : { ...current, [path]: { version, refreshable, editable } }), []);
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
    else tabs[index] = { ...tab, ...(tabs[index]!.kind === "file" && "pdf" in tabs[index]! ? { pdf: tabs[index]!.pdf } : {}), revision: tabs[index]!.revision + (edits.drafts[tab.path] === undefined ? 1 : 0) };
    return { ...current, tabs, activeId: tab.id };
  });
  function finish(action: FileEditAction) {
    for (const id of action.ids) {
      const tab = state.tabs.find(tab => tab.id === id);
      if (tab?.kind === "file" && edits.drafts[tab.path] !== undefined) edits.discard(tab.path);
    }
    if (action.kind === "refresh") setState(current => ({ ...current, tabs: current.tabs.map(tab => action.ids.includes(tab.id) ? { ...tab, revision: tab.revision + 1 } : tab) }));
    else if (action.kind === "hide") setState(current => ({ ...current, activeId: null }));
    else setState(current => {
      const index = current.tabs.findIndex(tab => tab.id === current.activeId);
      const tabs = current.tabs.filter(tab => !action.ids.includes(tab.id));
      return { ...current, tabs, activeId: current.activeId !== null && !action.ids.includes(current.activeId) ? current.activeId : tabs[Math.min(index, tabs.length - 1)]?.id ?? null };
    });
    setPending(null);
  }
  function request(action: FileEditAction) {
    const targets = state.tabs.filter(tab => action.ids.includes(tab.id));
    if (targets.some(tab => edits.saving.includes(tab.path))) return;
    if (targets.some(tab => edits.drafts[tab.path] !== undefined)) setPending(action);
    else finish(action);
  }
  async function save(id: string) {
    const tab = state.tabs.find(tab => tab.id === id);
    if (tab === undefined || tab.kind !== "file") throw new Error("A file tab is required to save.");
    const result = await edits.save(tab.path);
    queryClient.setQueryData(["file-preview", sessionId, tab.path, tab.revision], result);
    recordLoaded(tab.path, result.version, true, true);
    recordInfo(tab.path, { version: result.version, kind: "file", size: result.bytes });
  }
  async function savePending() {
    if (pending === null) throw new Error("No file close is pending.");
    for (const id of pending.ids) {
      const tab = state.tabs.find(tab => tab.id === id);
      if (tab?.kind === "file" && edits.drafts[tab.path] !== undefined) await save(id);
    }
    // All saves finished before a close can discard any editor state.
    finish(pending);
  }
  const setPdfView = useCallback((id: string, view: PdfView) => setState(current => {
    const tab = current.tabs.find(item => item.id === id);
    if (tab?.kind !== "file") throw new Error("PDF view requires an open file tab.");
    if (!validPdfView(view)) throw new Error("Invalid PDF viewing preference.");
    if (tab.pdf?.page === view.page && tab.pdf.zoom === view.zoom) return current;
    return { ...current, tabs: current.tabs.map(item => item.id === id ? { ...item, pdf: view } : item) };
  }), []);
  return <PreviewContext value={{ ...state, setPdfView, maximized, split, setSplit, loaded, watchErrors, drafts: edits.drafts, saving: edits.saving, saveErrors: edits.errors, storageError: edits.storageError, edit: edits.edit, save, recordLoaded, recordInfo, recordWatchError, registerWatch,
    hasUpdate: path => infos[path] !== undefined && loaded[path]?.version != null && (infos[path] === null || infos[path]!.kind !== "file" || infos[path]!.version !== loaded[path]!.version),
    retryWatch: path => { const retry = retries.current.get(path); if (retry === undefined) throw new Error("The file watch is not registered."); retry(); },
    openFile: (path, line) => { const normalized = workspaceFilePath(path); open({ kind: "file", id: `file:${normalized}`, path: normalized, line, revision: 0 }); },
    openDiff: (toolId, path) => open({ kind: "diff", id: `diff:${toolId}`, path, toolId, revision: 0 }),
    select: activeId => setState(current => ({ ...current, activeId })),
    closeTab: id => request({ kind: "close", ids: [id] }),
    closePanel: () => request({ kind: "hide", ids: state.tabs.map(tab => tab.id) }),
    resize: width => setState(current => ({ ...current, width: Math.max(20, Math.min(80, width)) })),
    toggleMaximized: () => setMaximized(current => !current),
    refresh: () => { if (state.activeId !== null) request({ kind: "refresh", ids: [state.activeId] }); },
  }}>{children}{state.tabs.filter(tab => tab.kind === "file" && tab.path.startsWith("/workspace/")).map(tab => <FileTabWatch key={tab.id} sessionId={sessionId} path={tab.path} />)}<FileEditConfirm action={pending} count={pending?.ids.filter(id => state.tabs.some(tab => tab.id === id && edits.drafts[tab.path] !== undefined)).length ?? 0} busy={edits.saving.length > 0} onCancel={() => setPending(null)} onDiscard={() => { if (pending !== null) finish(pending); }} onSave={savePending} /></PreviewContext>;
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
