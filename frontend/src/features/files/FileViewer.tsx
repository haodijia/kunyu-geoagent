import { useQuery } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { MessageMarkdown } from "@/features/messages/MessageMarkdown";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { readFileImage, readFilePreview, type FilePreview } from "./api";
import { formatFileBytes } from "./file-path";
import { useFilePreview, type PreviewTab } from "./FilePreviewContext";
import { filePreviewError, LoadingPreview, PreviewNotice } from "./preview-status";

const SourceEditor = lazy(() => import("./SourceEditor"));

const content = zhCN.filePreview;

export function FileViewer({ tab }: { readonly tab: Extract<PreviewTab, { kind: "file" }> }) {
  const session = useSessionWorkspace();
  const editor = useFilePreview();
  const { recordLoaded } = editor;
  const draft = editor.drafts[tab.path];
  const query = useQuery({ queryKey: ["file-preview", session.id, tab.path, tab.revision], queryFn: ({ signal }) => readFilePreview(session.id, tab.path, signal), staleTime: Infinity, gcTime: Infinity, retry: false });
  useEffect(() => { if (query.error !== null) console.error("[files] Preview failed.", { sessionId: session.id, path: tab.path, error: query.error }); }, [query.error, session.id, tab.path]);
  useEffect(() => {
    if (draft !== undefined) recordLoaded(tab.path, draft.version, true, true);
    else if (query.data !== undefined && !query.isError) recordLoaded(tab.path, query.data.version, query.data.state === "ready", query.data.editable);
    else if (query.isError) recordLoaded(tab.path, null, true, false);
  }, [query.data, query.isError, tab.path, recordLoaded, draft]);
  if (draft !== undefined) return <TextViewer tab={tab} text={draft.text} kind={draft.kind} base={query.data} error={query.error} />;
  if (query.isPending) return <LoadingPreview />;
  if (query.isError) return <PreviewNotice text={filePreviewError(query.error)} danger />;
  const preview = query.data;
  if (preview.state !== "ready") return <PreviewNotice text={preview.state === "unsupported" ? content.unsupported : content.oversized(preview.bytes, preview.threshold_bytes!)} />;
  if (preview.kind === "image") return <ImagePreview sessionId={session.id} preview={preview} />;
  if (preview.text === null || !(preview.kind === "code" || preview.kind === "markdown" || preview.kind === "html")) throw new Error("A text preview has no complete source.");
  return <TextViewer tab={tab} text={preview.text} kind={preview.kind} base={preview} error={null} />;
}

function TextViewer({ tab, text, kind, base, error }: { readonly tab: Extract<PreviewTab, { kind: "file" }>; readonly text: string; readonly kind: "code" | "markdown" | "html"; readonly base: FilePreview | undefined; readonly error: unknown }) {
  const editor = useFilePreview();
  const [mode, setMode] = useState<"source" | "preview">(tab.line === undefined ? "preview" : "source");
  const [split, setSplit] = useState(false);
  useEffect(() => { if (tab.line !== undefined) { setMode("source"); setSplit(false); } }, [tab]);
  const rendered = kind === "markdown" || kind === "html";
  const editable = editor.drafts[tab.path] !== undefined || base?.editable === true;
  const saving = editor.saving.includes(tab.path);
  const bytes = new TextEncoder().encode(text).length;
  return <>
    {error !== null && <div role="alert" className="border-b border-border px-3 py-2 text-xs text-destructive">{filePreviewError(error)}</div>}
    {editor.saveErrors[tab.path] !== undefined && <div role="alert" className="border-b border-border px-3 py-2 text-xs text-destructive">{editor.saveErrors[tab.path]}</div>}
    {rendered && <div className="flex h-8 shrink-0 items-center gap-0 border-b border-border bg-muted/50 px-2 text-xs" role="toolbar" aria-label={content.viewMode}>
      {(["source", "preview"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} className={`h-full border-b-2 px-2.5 ${mode === value ? "border-primary bg-primary/10 text-primary" : "border-transparent text-secondary-foreground hover:bg-muted"}`} onClick={() => { setMode(value); setSplit(false); }}>{content[value]}</button>)}
      <Button size="sm" variant="ghost" className="ml-2 h-6 text-xs" aria-pressed={split} onClick={() => setSplit(current => !current)}>{content.split}</Button>
    </div>}
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {(split || !rendered || mode === "source") && <Suspense fallback={<LoadingPreview />}><SourceEditor text={text} path={tab.path} line={tab.line} readOnly={!editable || saving} onChange={value => editor.edit(tab.path, value, base)} /></Suspense>}
      {(split || (rendered && mode === "preview")) && <div className="min-h-0 min-w-0 flex-1 overflow-auto border-l border-border">
        {kind === "markdown" ? <div className="p-5"><MessageMarkdown text={text} basePath={tab.path.slice(0, tab.path.lastIndexOf("/") + 1)} /></div>
          : <iframe title={content.html} className="h-full w-full border-0 bg-white" sandbox="allow-scripts" srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">${text}`} />}
      </div>}
    </div>
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-border px-3 text-[11px] text-muted-foreground"><span>{formatFileBytes(bytes)}</span><span>{saving ? content.saving : editable ? editor.drafts[tab.path] !== undefined ? content.unsaved : content.saved : content.readOnly}</span></div>
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
