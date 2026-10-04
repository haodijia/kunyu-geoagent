import { useQuery } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { readFileImage, readFilePreview, type FilePreview } from "./api";
import { useFilePreview, type PreviewTab } from "./FilePreviewContext";
import { filePreviewError, LoadingPreview, PreviewNotice } from "./preview-status";
import { TextPreview } from "./TextPreview";

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
  if (draft !== undefined) return <TextPreview tab={tab} text={draft.text} kind={draft.kind} base={query.data} error={query.error} />;
  if (query.isPending) return <LoadingPreview />;
  if (query.isError) return <PreviewNotice text={filePreviewError(query.error)} danger />;
  const preview = query.data;
  if (preview.state !== "ready") return <PreviewNotice text={preview.state === "unsupported" ? content.unsupported : content.oversized(preview.bytes, preview.threshold_bytes!)} />;
  if (preview.kind === "image") return <ImagePreview sessionId={session.id} preview={preview} />;
  if (preview.text === null || !(preview.kind === "code" || preview.kind === "markdown" || preview.kind === "html")) throw new Error("A text preview has no complete source.");
  return <TextPreview tab={tab} text={preview.text} kind={preview.kind} base={preview} error={null} />;
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
