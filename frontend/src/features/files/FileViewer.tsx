import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";

import { ImageLightbox } from "@/features/attachments/ImageLightbox";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { readFileImage, readFilePreview, type FilePreview } from "./api";
import { useFilePreview, type PreviewTab } from "./FilePreviewContext";
import { filePreviewError, LoadingPreview, PreviewNotice } from "./preview-status";
import { TextPreview } from "./TextPreview";

const PdfPreview = lazy(() => import("./pdf/PdfPreview").then(module => ({ default: module.PdfPreview })));
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
  if (preview.kind === "pdf") return <Suspense fallback={<LoadingPreview />}><PdfPreview sessionId={session.id} tab={tab} preview={preview} /></Suspense>;
  if (preview.kind === "image") return <ImagePreview sessionId={session.id} preview={preview} />;
  if (preview.text === null || !(preview.kind === "code" || preview.kind === "markdown" || preview.kind === "html")) throw new Error("A text preview has no complete source.");
  return <TextPreview tab={tab} text={preview.text} kind={preview.kind} base={preview} error={null} />;
}

function ImagePreview({ sessionId, preview }: { readonly sessionId: string; readonly preview: FilePreview }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [lightbox, setLightbox] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl: string | null = null;
    setUrl(null); setError(null); setLightbox(false);
    void readFileImage(sessionId, preview, controller.signal).then(blob => { if (controller.signal.aborted) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(error => { if (controller.signal.aborted) return; console.error("[files] Image preview failed.", { sessionId, path: preview.path, error }); setError(error); });
    return () => { controller.abort(); if (objectUrl !== null) URL.revokeObjectURL(objectUrl); };
  }, [sessionId, preview]);
  if (error !== null) return <PreviewNotice text={filePreviewError(error)} danger />;
  if (url === null) return <LoadingPreview />;
  const failed = () => { console.error("[files] Image decoding failed.", { sessionId, path: preview.path }); setError(new Error(content.imageFailed)); };
  return <><div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-background p-6"><button type="button" className="flex size-full min-h-0 min-w-0 items-center justify-center" aria-label={zhCN.conversation.attachments.preview(preview.path)} onClick={() => setLightbox(true)}><img src={url} alt={preview.path} className="size-full object-contain" onError={failed} /></button></div>
    {lightbox && <ImageLightbox src={url} name={preview.path} description={`${preview.bytes} B`} onClose={() => setLightbox(false)} onError={failed} />}
  </>;
}
