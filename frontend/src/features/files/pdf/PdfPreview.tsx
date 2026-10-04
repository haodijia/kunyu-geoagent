import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { zhCN } from "@/locales/zh-CN";
import { readFilePdf, type FilePreview } from "../api";
import { useFilePreview, type PreviewTab } from "../FilePreviewContext";
import { filePreviewError, LoadingPreview, PreviewNotice } from "../preview-status";
import type { PdfDocument, PdfSession } from "./document";
import { PdfWorkerFailure } from "./errors";
import { pageGeometries, PdfPage, type PdfPageGeometry } from "./PdfPages";
import { PdfToolbar } from "./PdfToolbar";
import { openPdf } from "./runtime";

const DEFAULT_VIEW = { page: 1, zoom: "fit" } as const;
type DocumentState = { readonly document: PdfDocument; readonly sizes: readonly PdfPageGeometry[]; readonly signal: AbortSignal };

export function PdfPreview({ sessionId, tab, preview }: {
  readonly sessionId: string; readonly tab: Extract<PreviewTab, { kind: "file" }>; readonly preview: FilePreview;
}) {
  const { setPdfView } = useFilePreview();
  const view = tab.pdf ?? DEFAULT_VIEW;
  const [loaded, setLoaded] = useState<DocumentState | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const selected = useRef(view.page);
  selected.current = view.page;
  const programmatic = useRef(false);
  const scrollFrame = useRef<number | null>(null);
  useEffect(() => () => { if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current); }, []);
  const markProgrammatic = useCallback(() => {
    programmatic.current = true;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => { programmatic.current = false; scrollFrame.current = null; });
  }, []);
  useEffect(() => {
    const lifetime = new AbortController(); const signal = lifetime.signal;
    let session: PdfSession | undefined;
    setLoaded(null); setError(null);
    const failed = (error: unknown) => { if (!signal.aborted) { console.error("[pdf] Document loading failed.", { sessionId, path: preview.path, error }); setError(error); void session?.dispose(); } };
    void readFilePdf(sessionId, preview, signal).then(async blob => {
      if (blob.type !== "application/pdf") throw new Error("Invalid PDF preview media type.");
      const data = new Uint8Array(await blob.arrayBuffer()); signal.throwIfAborted();
      session = openPdf(data, signal, failed);
      const document = await session.document;
      const sizes = await pageGeometries(document, signal); signal.throwIfAborted();
      setLoaded({ document, sizes, signal });
    }).catch(failed);
    return () => { lifetime.abort(); void session?.dispose(); };
  }, [sessionId, preview]);
  useLayoutEffect(() => {
    if (viewport === null) return;
    const measure = () => setWidth(Math.max(0, viewport.clientWidth - 32));
    const observer = new ResizeObserver(measure); observer.observe(viewport); measure();
    return () => observer.disconnect();
  }, [viewport]);
  const jump = useCallback((page: number) => {
    if (viewport === null || loaded === null) return;
    const clamped = Math.max(1, Math.min(loaded.document.numPages, page));
    const target = viewport.querySelector<HTMLElement>(`[data-pdf-page="${clamped}"]`);
    if (target === null) throw new Error("PDF page has no display target.");
    markProgrammatic();
    viewport.scrollTop += target.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 16;
    setPdfView(tab.id, { ...view, page: clamped });
  }, [loaded, viewport, view, setPdfView, tab.id, markProgrammatic]);
  useLayoutEffect(() => {
    if (loaded === null || viewport === null) return;
    const page = Math.min(loaded.document.numPages, selected.current);
    const target = viewport.querySelector<HTMLElement>(`[data-pdf-page="${page}"]`);
    if (target === null) throw new Error("Restored PDF page has no display target.");
    markProgrammatic();
    viewport.scrollTop += target.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 16;
    if (page !== selected.current) setPdfView(tab.id, { page, zoom: view.zoom });
  }, [loaded, viewport, width, view.zoom, setPdfView, tab.id, markProgrammatic]);
  if (error !== null) return <PreviewNotice danger text={error instanceof PdfWorkerFailure ? zhCN.pdfPreview.workerFailed : error instanceof Error && error.name === "PasswordException" ? zhCN.pdfPreview.passwordRequired : filePreviewError(error)} />;
  if (loaded === null) return <LoadingPreview />;
  const actualView = { ...view, page: Math.min(view.page, loaded.document.numPages) };
  const intrinsicWidth = loaded.sizes[actualView.page - 1]!.width;
  const largest = loaded.sizes.reduce((maximum, size) => Math.max(maximum, size.width), 0);
  return <><PdfToolbar view={actualView} count={loaded.document.numPages} fitPercent={width / intrinsicWidth * 100} onPage={jump} onZoom={zoom => setPdfView(tab.id, { ...actualView, zoom })} />
    <div ref={setViewport} className="min-h-0 min-w-0 flex-1 overflow-auto bg-muted/50 p-4" data-pdf-preview onScroll={() => {
      if (viewport === null) return;
      if (programmatic.current) { programmatic.current = false; return; }
      const top = viewport.getBoundingClientRect().top + 16;
      const page = [...viewport.querySelectorAll<HTMLElement>("[data-pdf-page]")].find(element => element.getBoundingClientRect().bottom > top + 1);
      if (page === undefined) return;
      const number = Number(page.dataset.pdfPage);
      if (number !== actualView.page) setPdfView(tab.id, { ...actualView, page: number });
    }}><div className="flex min-w-full flex-col gap-4" style={{ width: view.zoom === "fit" ? "100%" : Math.max(width, largest * view.zoom / 100) }}>
      {loaded.sizes.map(geometry => <PdfPage key={geometry.page} document={loaded.document} geometry={geometry} selected={geometry.page === actualView.page} signal={loaded.signal} zoom={view.zoom} scale={view.zoom === "fit" ? width / geometry.width : view.zoom / 100} />)}
    </div></div>
  </>;
}
