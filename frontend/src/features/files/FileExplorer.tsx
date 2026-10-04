import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, File, FileCode, FileImage, FileText, FolderClosed, FolderOpen, ListCollapse, LoaderCircle, PanelRightClose, PanelRightOpen, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { directoryQueryKey, listDirectory, type DirectoryEntry } from "./api";
import { formatFileBytes } from "./file-path";
import { useFileExplorer } from "./FileExplorerContext";
import { useFilePreview } from "./FilePreviewContext";
import { filePreviewError } from "./preview-status";
import styles from "./FileExplorer.module.css";

const content = zhCN.fileExplorer;
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function FileExplorerToggle() {
  const explorer = useFileExplorer();
  return <Tooltip label={content.toggle}><Button variant="ghost" size="icon" className="size-8" aria-label={content.toggle} aria-controls="workspace-files-panel" aria-expanded={explorer.open} onClick={explorer.togglePanel}>{explorer.open ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}</Button></Tooltip>;
}

export function FileExplorerLayout({ children }: { readonly children: ReactNode }) {
  const explorer = useFileExplorer();
  const session = useSessionWorkspace();
  const queryClient = useQueryClient();
  const root = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const preview = useFilePreview();
  const active = preview.tabs.find(tab => tab.id === preview.activeId);
  const rootQuery = useQuery({ queryKey: directoryQueryKey(session.id, "/workspace"), queryFn: ({ signal }) => listDirectory(session.id, "/workspace", signal), retry: false });
  useEffect(() => {
    if (rootQuery.data !== undefined && rootQuery.data.entries.length > 0 && window.innerWidth >= 768) explorer.showWhenPopulated();
  }, [rootQuery.data, explorer.showWhenPopulated]);
  useEffect(() => { if (rootQuery.error !== null) console.error("[files] Root listing failed.", { sessionId: session.id, error: rootQuery.error }); }, [rootQuery.error, session.id]);
  useEffect(() => { if (active?.kind === "file") explorer.select(active.path); }, [active, explorer.select]);
  async function refresh() {
    setRefreshing(true);
    try { await queryClient.invalidateQueries({ queryKey: directoryQueryKey(session.id) }); }
    finally { setRefreshing(false); }
  }
  return <div ref={root} className={styles.frame} style={{ "--files-width": `${explorer.width}px`, "--files-reserved": active === undefined ? "360px" : "700px" } as CSSProperties}>
    <div className={styles.main}>{children}</div>
    {explorer.open && <>
      <button type="button" className={styles.backdrop} aria-label={content.close} onClick={explorer.closePanel} />
      <aside id="workspace-files-panel" className={styles.panel} aria-label={content.title}>
        <div className={styles.resize} role="separator" tabIndex={0} aria-label={content.resize} aria-orientation="vertical" aria-valuemin={220} aria-valuemax={500} aria-valuenow={explorer.width}
          onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; explorer.resize(root.current!.getBoundingClientRect().right - event.clientX); }}
          onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}
          onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); explorer.resize(explorer.width + (event.key === "ArrowLeft" ? 10 : -10)); } }} />
        <header className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3 text-xs"><span>{content.title}</span><FileExplorerToggle /></header>
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border pl-3 pr-2">
          <FolderClosed className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate text-xs" title="/workspace">{content.root}</span>
          <Tooltip label={content.refresh}><Button variant="ghost" size="icon" className="size-6" disabled={refreshing} aria-label={content.refresh} onClick={() => void refresh()}><RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /></Button></Tooltip>
          <Tooltip label={content.collapse}><Button variant="ghost" size="icon" className="size-6" aria-label={content.collapse} onClick={explorer.collapseAll}><ListCollapse className="size-3.5" /></Button></Tooltip>
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-1" onKeyDown={event => {
          if (event.key === "Escape") explorer.closePanel();
          if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=treeitem] > button:not(:disabled)")];
            const index = rows.indexOf(document.activeElement as HTMLButtonElement);
            const target = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowUp" ? -1 : 1)));
            rows[target]?.focus();
          }
        }}>
          <ul role="tree" aria-label={content.root} className="m-0 list-none p-0"><DirectoryLevel path="/workspace" depth={0} /></ul>
        </div>
      </aside>
    </>}
  </div>;
}

function DirectoryLevel({ path, depth }: { readonly path: string; readonly depth: number }) {
  const session = useSessionWorkspace();
  const query = useQuery({ queryKey: directoryQueryKey(session.id, path), queryFn: ({ signal }) => listDirectory(session.id, path, signal), retry: false });
  const entries = useMemo(() => [...(query.data?.entries ?? [])].sort((a, b) => Number(b.type === "directory") - Number(a.type === "directory") || byName.compare(a.name, b.name)), [query.data]);
  useEffect(() => { if (query.error !== null) console.error("[files] Directory listing failed.", { sessionId: session.id, path, error: query.error }); }, [query.error, session.id, path]);
  if (query.isPending) return <li role="none" className={styles.note}><LoaderCircle className="mr-1 inline size-3 animate-spin" />{content.loading}</li>;
  if (query.isError) return <li role="none" className={styles.note}><span role="alert" className="text-destructive">{filePreviewError(query.error)}</span></li>;
  return <>
    {entries.length === 0 && <li role="none" className={styles.note}>{content.empty}</li>}
    {entries.map(entry => <TreeEntry key={entry.name} entry={entry} path={`${path}/${entry.name}`} depth={depth} />)}
    {query.data.truncated && <li role="none" className={styles.note}>{content.truncated}</li>}
  </>;
}

function TreeEntry({ entry, path, depth }: { readonly entry: DirectoryEntry; readonly path: string; readonly depth: number }) {
  const explorer = useFileExplorer();
  const preview = useFilePreview();
  const directory = entry.type === "directory";
  const expanded = explorer.expanded.includes(path);
  const selected = explorer.selected === path;
  function open() {
    explorer.select(path);
    if (directory) explorer.toggleDirectory(path);
    else { preview.openFile(path); if (window.innerWidth < 768) explorer.closePanel(); }
  }
  return <li role="treeitem" aria-level={depth + 1} aria-expanded={directory ? expanded : undefined} aria-selected={selected} aria-disabled={entry.type === "other"} data-files-entry={entry.type} data-files-path={path}>
    <button type="button" className={`${styles.row} ${selected ? styles.selected : ""}`} style={{ paddingLeft: 8 + depth * 16 }} disabled={entry.type === "other"} title={entry.type === "other" ? content.other : entry.size === null ? path : `${path} · ${formatFileBytes(entry.size)}`} onClick={open}
      onKeyDown={event => { if (directory && (event.key === "ArrowRight" || event.key === "ArrowLeft")) { event.preventDefault(); if ((event.key === "ArrowRight") !== expanded) explorer.toggleDirectory(path); } }}>
      {directory ? <ChevronRight className={`size-3 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} /> : <span className="w-3 shrink-0" />}
      {directory ? expanded ? <FolderOpen className="size-4 shrink-0 text-muted-foreground" /> : <FolderClosed className="size-4 shrink-0 text-muted-foreground" /> : <FileIcon name={entry.name} />}
      <span className="truncate">{entry.name}</span>
    </button>
    {directory && expanded && <ul role="group" className="m-0 list-none p-0"><DirectoryLevel path={path} depth={depth + 1} /></ul>}
  </li>;
}

function FileIcon({ name }: { readonly name: string }) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  const Icon = extension !== undefined && ["png", "jpg", "jpeg", "webp", "gif", "svg", "tif", "tiff"].includes(extension) ? FileImage
    : extension !== undefined && ["md", "markdown", "txt", "pdf", "doc", "docx"].includes(extension) ? FileText
    : extension !== undefined && ["py", "ts", "tsx", "js", "json", "css", "html", "yaml", "yml", "toml", "sql"].includes(extension) ? FileCode : File;
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}
