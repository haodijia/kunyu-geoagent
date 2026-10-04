import { useQuery } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { MessageMarkdown } from "@/features/messages/MessageMarkdown";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { readFileImage, readFilePreview, type FilePreview } from "./api";
import { formatFileBytes } from "./file-path";
import type { PreviewTab } from "./FilePreviewContext";
import { filePreviewError, LoadingPreview, PreviewNotice } from "./preview-status";

const SourcePreview = lazy(() => import("./SourcePreview"));

const content = zhCN.filePreview;

export function FileViewer({ tab }: { readonly tab: Extract<PreviewTab, { kind: "file" }> }) {
  const session = useSessionWorkspace();
  const query = useQuery({ queryKey: ["file-preview", session.id, tab.path, tab.revision], queryFn: ({ signal }) => readFilePreview(session.id, tab.path, signal), retry: false });
  const [mode, setMode] = useState<"source" | "preview">(tab.line === undefined ? "preview" : "source");
  const [split, setSplit] = useState(false);
  useEffect(() => { if (query.error !== null) console.error("[files] Preview failed.", { sessionId: session.id, path: tab.path, error: query.error }); }, [query.error, session.id, tab.path]);
  if (query.isPending) return <LoadingPreview />;
  if (query.isError) return <PreviewNotice text={filePreviewError(query.error)} danger />;
  const preview = query.data;
  if (preview.state !== "ready") return <PreviewNotice text={preview.state === "unsupported" ? content.unsupported : content.oversized(preview.bytes, preview.threshold_bytes!)} />;
  if (preview.kind === "image") return <ImagePreview sessionId={session.id} preview={preview} />;
  if (preview.text === null) throw new Error("A text preview has no complete source.");
  const rendered = preview.kind === "markdown" || preview.kind === "html";
  return <>
    {rendered && <div className="flex h-8 shrink-0 items-center gap-0 border-b border-border bg-muted/50 px-2 text-xs" role="toolbar" aria-label={content.viewMode}>
      {(["source", "preview"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} className={`h-full border-b-2 px-2.5 ${mode === value ? "border-primary bg-primary/10 text-primary" : "border-transparent text-secondary-foreground hover:bg-muted"}`} onClick={() => { setMode(value); setSplit(false); }}>{content[value]}</button>)}
      <Button size="sm" variant="ghost" className="ml-2 h-6 text-xs" aria-pressed={split} onClick={() => setSplit(current => !current)}>{content.split}</Button>
    </div>}
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {(split || !rendered || mode === "source") && <Suspense fallback={<LoadingPreview />}><SourcePreview text={preview.text} path={preview.path} line={tab.line} /></Suspense>}
      {(split || (rendered && mode === "preview")) && <div className="min-h-0 min-w-0 flex-1 overflow-auto border-l border-border">
        {preview.kind === "markdown" ? <div className="p-5"><MessageMarkdown text={preview.text} basePath={preview.path.slice(0, preview.path.lastIndexOf("/") + 1)} /></div>
          : <iframe title={content.html} className="h-full w-full border-0 bg-white" sandbox="allow-scripts" srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">${preview.text}`} />}
      </div>}
    </div>
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-border px-3 text-[11px] text-muted-foreground"><span>{formatFileBytes(preview.bytes)}</span><span>{content.readOnly}</span></div>
  </>;
}

function ImagePreview({ sessionId, preview }: { readonly sessionId: string; readonly preview: FilePreview }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl: string | null = null;
    void readFileImage(sessionId, preview, controller.signal).then(blob => { if (controller.signal.aborted) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(error => { if (controller.signal.aborted) return; console.error("[files] Image preview failed.", { sessionId, path: preview.path, error }); setError(error); });
    return () => { controller.abort(); if (objectUrl !== null) URL.revokeObjectURL(objectUrl); };
  }, [sessionId, preview]);
  if (error !== null) return <PreviewNotice text={filePreviewError(error)} danger />;
  if (url === null) return <LoadingPreview />;
  return <><div className="flex h-8 shrink-0 items-center justify-center gap-3 border-b border-border bg-muted/50 text-xs">
    <Button variant="ghost" size="icon" className="size-6" aria-label={content.zoomOut} onClick={() => setZoom(value => Math.max(25, value - 25))}><Minus className="size-3" /></Button>
    <button type="button" onClick={() => setZoom(100)}>{zoom}%</button>
    <Button variant="ghost" size="icon" className="size-6" aria-label={content.zoomIn} onClick={() => setZoom(value => Math.min(400, value + 25))}><Plus className="size-3" /></Button>
  </div><div className="min-h-0 flex-1 overflow-auto bg-muted/50 p-4"><img src={url} alt={preview.path} style={{ width: `${zoom}%`, maxWidth: "none" }} onError={() => setError(new Error(content.imageFailed))} /></div></>;
}
