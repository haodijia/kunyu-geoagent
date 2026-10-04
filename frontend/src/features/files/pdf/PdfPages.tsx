import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";
import { renderPdfPage, type PdfDocument, type PdfPageSize } from "./document";
import { pdfTextRenderer } from "./text";
import css from "./PdfPages.module.css";

export interface PdfPageGeometry extends PdfPageSize { readonly page: number; }

export async function pageGeometries(document: PdfDocument, signal: AbortSignal): Promise<readonly PdfPageGeometry[]> {
  const sizes: PdfPageGeometry[] = new Array(document.numPages);
  let next = 1;
  await Promise.all(Array.from({ length: Math.min(4, document.numPages) }, async () => {
    while (next <= document.numPages) {
      signal.throwIfAborted();
      const number = next++;
      const page = await document.getPage(number);
      try {
        signal.throwIfAborted();
        const viewport = page.getViewport({ scale: 96 / 72 });
        sizes[number - 1] = { page: number, width: viewport.width, height: viewport.height };
      } finally { page.cleanup(); }
    }
  }));
  return sizes;
}

export function PdfPage({ document, geometry, zoom, scale, selected, signal }: {
  readonly document: PdfDocument; readonly geometry: PdfPageGeometry;
  readonly zoom: "fit" | number; readonly scale: number; readonly selected: boolean; readonly signal: AbortSignal;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(selected);
  const [rendered, setRendered] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const renderKey = `${scale}:${attempt}`;
  const ready = rendered === renderKey;
  useEffect(() => { if (selected) setRequested(true); }, [selected]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setRequested(true); observer.disconnect();
    }, { rootMargin: "100% 0px" });
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!requested || scale <= 0) return;
    const lifetime = new AbortController();
    const stopped = AbortSignal.any([lifetime.signal, signal]);
    const createText = pdfTextRenderer(text.current!);
    let textTask: ReturnType<typeof createText> | undefined;
    setRendered(null); setError(null);
    void renderPdfPage(document, geometry.page, canvas.current!, stopped, window.devicePixelRatio * scale, (page, viewport) => {
      textTask = createText(page, viewport); return textTask;
    }).then(() => { if (!stopped.aborted) setRendered(`${scale}:${attempt}`); }).catch(error => {
      if (stopped.aborted) return;
      console.error("[pdf] Page rendering failed.", { page: geometry.page, error }); setError(error);
    });
    return () => { lifetime.abort(); textTask?.cancel(); };
  }, [document, geometry.page, requested, signal, attempt, scale]);
  return <div ref={host} className={css.page} data-pdf-page={geometry.page}>
    <div className={css.surface} style={{ width: zoom === "fit" ? "100%" : geometry.width * zoom / 100, aspectRatio: `${geometry.width} / ${geometry.height}` }}>
      {!ready && error === null && <div className={css.placeholder} role="status" aria-label={zhCN.pdfPreview.rendering(geometry.page)} />}
      {error !== null && <div className={css.failure} role="alert"><span>{zhCN.pdfPreview.renderFailed(geometry.page)}</span><Button size="sm" variant="outline" onClick={() => setAttempt(value => value + 1)}>{zhCN.pdfPreview.retry}</Button></div>}
      <canvas key={renderKey} ref={canvas} className={css.canvas} style={{ visibility: ready ? "visible" : "hidden" }} role="img" aria-label={zhCN.pdfPreview.pageImage(geometry.page)} />
      <div ref={text} className={css.text} style={{ visibility: ready ? "visible" : "hidden" }} data-pdf-text />
    </div>
  </div>;
}
