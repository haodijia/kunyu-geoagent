import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";
import type { PdfView } from "../FilePreviewContext";

export function PdfToolbar({ view, count, fitPercent, onPage, onZoom }: {
  readonly view: PdfView; readonly count: number; readonly fitPercent: number;
  readonly onPage: (page: number) => void; readonly onZoom: (zoom: PdfView["zoom"]) => void;
}) {
  const content = zhCN.pdfPreview;
  const [field, setField] = useState(String(view.page));
  useEffect(() => setField(String(view.page)), [view.page]);
  const submit = () => {
    const value = Number(field);
    if (Number.isSafeInteger(value) && value >= 1 && value <= count) onPage(value);
    else setField(String(view.page));
  };
  const zoom = view.zoom === "fit" ? fitPercent : view.zoom;
  const options = [...new Set([25, 50, 75, 100, 125, 150, 200, 300, 400, ...(view.zoom === "fit" ? [] : [view.zoom])])].sort((a, b) => a - b);
  return <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-center gap-1 border-b border-border bg-muted/50 px-2 py-1 text-xs" aria-label={content.controls}>
    <Button variant="ghost" size="icon" className="size-7" aria-label={content.previous} disabled={view.page === 1} onClick={() => onPage(view.page - 1)}><ChevronLeft className="size-3.5" /></Button>
    <form className="flex items-center gap-1.5" onSubmit={event => { event.preventDefault(); submit(); }}><input className="h-6 w-10 rounded border border-border bg-background text-center text-xs tabular-nums" aria-label={content.page} inputMode="numeric" value={field} onChange={event => setField(event.target.value)} onBlur={submit} /><span className="tabular-nums text-muted-foreground">/ {count}</span></form>
    <Button variant="ghost" size="icon" className="size-7" aria-label={content.next} disabled={view.page === count} onClick={() => onPage(view.page + 1)}><ChevronRight className="size-3.5" /></Button>
    <span className="mx-1 h-4 border-l border-border" />
    <Button variant="ghost" size="icon" className="size-7" aria-label={zhCN.filePreview.zoomOut} disabled={zoom <= 25} onClick={() => onZoom(Math.max(25, Math.min(400, Math.round(zoom - 25))))}><Minus className="size-3.5" /></Button>
    <select aria-label={content.zoom} value={view.zoom} className="h-6 max-w-28 rounded bg-background px-1 text-xs" onChange={event => onZoom(event.target.value === "fit" ? "fit" : Number(event.target.value))}><option value="fit">{content.fitWidth}</option>{options.map(value => <option key={value} value={value}>{value}%</option>)}</select>
    <Button variant="ghost" size="icon" className="size-7" aria-label={zhCN.filePreview.zoomIn} disabled={zoom >= 400} onClick={() => onZoom(Math.max(25, Math.min(400, Math.round(zoom + 25))))}><Plus className="size-3.5" /></Button>
    <span className="ml-1 text-muted-foreground">{zhCN.filePreview.readOnly}</span>
  </div>;
}
