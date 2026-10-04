import { ArrowLeftRight, Download, FileText, Maximize2, Minimize2, RefreshCw, X } from "lucide-react";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { parseFileMutationResult } from "@/features/agent/file-diffs";
import { CopyButton } from "@/features/messages/CopyButton";
import { useSessionMessages } from "@/features/messages/SessionMessagesContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { downloadFile } from "./api";
import { AppliedDiff } from "./AppliedDiff";
import { fileName } from "./file-path";
import { useFilePreview, type PreviewTab } from "./FilePreviewContext";
import { FileViewer } from "./FileViewer";
import { filePreviewError, LoadingPreview, PreviewNotice } from "./preview-status";
import styles from "./FilePreviewLayout.module.css";

const content = zhCN.filePreview;

export function FilePreviewLayout({ children }: { readonly children: ReactNode }) {
  const preview = useFilePreview();
  const session = useSessionWorkspace();
  const root = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const tab = preview.tabs.find(item => item.id === preview.activeId);
  async function download() {
    if (tab === undefined || tab.kind !== "file" || downloading) return;
    setDownloading(true);
    try {
      const blob = await downloadFile(session.id, tab.path); const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = fileName(tab.path); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { console.error("[files] Download failed.", { sessionId: session.id, path: tab.path, error }); toast.error(filePreviewError(error)); }
    finally { setDownloading(false); }
  }
  return <div ref={root} className={styles.frame} style={{ "--preview-width": `${preview.width}%` } as CSSProperties}>
    <div className={styles.main}>{children}</div>
    {tab !== undefined && <aside className={`${styles.panel} ${preview.maximized ? styles.maximized : ""}`} aria-label={content.title} data-file-preview-path={tab.path}>
      {!preview.maximized && <div className={styles.resize} role="separator" tabIndex={0} aria-label={content.resize} aria-orientation="vertical" aria-valuemin={20} aria-valuemax={80} aria-valuenow={preview.width}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const bounds = root.current!.getBoundingClientRect(); preview.resize((bounds.right - event.clientX) / bounds.width * 100); }}
        onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}
        onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); preview.resize(preview.width + (event.key === "ArrowLeft" ? 2 : -2)); } }} />}
      <div className="flex h-9 shrink-0 items-center border-b border-border bg-muted/50" role="tablist" aria-label={content.tabs}>
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {preview.tabs.map(item => <div key={item.id} className={`flex h-9 shrink-0 items-center border-r border-border ${item.id === preview.activeId ? "border-t-2 border-t-primary bg-background" : "text-secondary-foreground"}`}>
            <button type="button" role="tab" aria-selected={item.id === preview.activeId} aria-controls="file-preview-body" className="flex max-w-52 items-center gap-1.5 px-3 text-xs" title={item.path} onClick={() => preview.select(item.id)}>
              {item.kind === "file" ? <FileText className="size-3.5 shrink-0" /> : <ArrowLeftRight className="size-3.5 shrink-0" />}<span className="truncate">{fileName(item.path)}{item.kind === "diff" ? ` · ${content.diff}` : ""}</span>
            </button><button type="button" className="mr-1 rounded p-1 hover:bg-muted" aria-label={content.closeTab(fileName(item.path))} onClick={() => preview.closeTab(item.id)}><X className="size-3" /></button>
          </div>)}
        </div>
        <Button type="button" size="icon" variant="ghost" className="size-7 shrink-0" aria-label={content.close} onClick={preview.closePanel}><X className="size-3.5" /></Button>
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/50 px-2">
        <span className="min-w-0 truncate text-[11px] text-secondary-foreground" title={tab.path}>{tab.path}</span>
        <div className="flex shrink-0 items-center gap-1">
          <CopyButton text={tab.path} />
          {tab.kind === "file" && <><Button variant="ghost" size="icon" className="size-6" aria-label={content.refresh} onClick={preview.refresh}><RefreshCw className="size-3" /></Button><Button variant="ghost" size="icon" className="size-6" disabled={downloading} aria-label={content.download} onClick={() => void download()}><Download className="size-3" /></Button></>}
          <Button variant="ghost" size="icon" className="size-6" aria-label={preview.maximized ? content.restore : content.maximize} onClick={preview.toggleMaximized}>{preview.maximized ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}</Button>
        </div>
      </div>
      <div id="file-preview-body" className="flex min-h-0 min-w-0 flex-1 flex-col" role="tabpanel" onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "w") { event.preventDefault(); preview.closeTab(tab.id); } }}>
        {tab.kind === "file" ? <FileViewer key={`${tab.id}:${tab.revision}`} tab={tab} /> : <DiffPreview tab={tab} />}
      </div>
    </aside>}
  </div>;
}

function DiffPreview({ tab }: { readonly tab: Extract<PreviewTab, { kind: "diff" }> }) {
  const { agentTurnsQuery } = useSessionMessages();
  if (agentTurnsQuery.isPending) return <LoadingPreview />;
  if (agentTurnsQuery.isError) return <PreviewNotice text={filePreviewError(agentTurnsQuery.error)} danger />;
  const tool = agentTurnsQuery.data.flatMap(turn => turn.tool_calls).find(tool => tool.id === tab.toolId);
  if (tool === undefined || tool.status !== "completed" || (tool.name !== "write" && tool.name !== "edit")) return <PreviewNotice text={content.diffMissing} danger />;
  return <AppliedDiff result={parseFileMutationResult(tool.result)} />;
}
