import { ChevronLeft, ChevronRight, Download, FileText, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";
import { readAttachment, type Attachment } from "./api";

const content = zhCN.conversation.attachments;

export function AttachmentStrip({ sessionId, attachments, disabled = false, onRemove }: {
  readonly sessionId: string;
  readonly attachments: readonly Attachment[];
  readonly disabled?: boolean;
  readonly onRemove?: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null) return;
    const update = () => setEdges({ left: scroller.scrollLeft > 1, right: scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1 });
    update();
    const observer = new ResizeObserver(update); observer.observe(scroller);
    scroller.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); scroller.removeEventListener("scroll", update); };
  }, [attachments]);
  if (attachments.length === 0) return null;
  return <div className="relative min-w-0 max-w-full"><div ref={scrollRef} aria-label={content.list} className="flex min-w-0 max-w-full items-center gap-2 overflow-x-auto py-1.5 [scrollbar-width:none]">
    {attachments.map((ref) => <AttachmentCard key={ref.id} sessionId={sessionId} attachment={ref} disabled={disabled} onRemove={onRemove} />)}
  </div>
    {edges.left && <div className="pointer-events-none absolute inset-y-0 left-0 flex w-[60px] items-center bg-[linear-gradient(to_left,transparent,var(--attachment-surface,var(--mu-composer-bg))_70%)]"><Button type="button" size="icon" variant="outline" className="pointer-events-auto size-7 rounded-full bg-background shadow-sm" aria-label={content.scrollLeft} onClick={() => scrollRef.current?.scrollBy({ left: -200, behavior: "smooth" })}><ChevronLeft className="size-3.5" /></Button></div>}
    {edges.right && <div className="pointer-events-none absolute inset-y-0 right-0 flex w-[60px] items-center justify-end bg-[linear-gradient(to_right,transparent,var(--attachment-surface,var(--mu-composer-bg))_70%)]"><Button type="button" size="icon" variant="outline" className="pointer-events-auto size-7 rounded-full bg-background shadow-sm" aria-label={content.scrollRight} onClick={() => scrollRef.current?.scrollBy({ left: 200, behavior: "smooth" })}><ChevronRight className="size-3.5" /></Button></div>}
  </div>;
}

function AttachmentCard({ sessionId, attachment: ref, disabled, onRemove }: {
  readonly sessionId: string; readonly attachment: Attachment; readonly disabled: boolean;
  readonly onRemove: ((id: string) => void) | undefined;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    if (ref.kind !== "image") return;
    const controller = new AbortController(); let objectUrl: string | null = null;
    setUrl(null); setFailed(false);
    void readAttachment(sessionId, ref.id, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      console.error("[attachments] Preview failed.", { sessionId, attachmentId: ref.id, error }); setFailed(true);
    });
    return () => { controller.abort(); if (objectUrl !== null) URL.revokeObjectURL(objectUrl); };
  }, [sessionId, ref.id, ref.kind]);
  async function download() {
    if (downloading) return; setDownloading(true);
    try {
      const blob = await readAttachment(sessionId, ref.id); const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = objectUrl; link.download = ref.kind === "image" ? `${ref.name.replace(/\.[^.]*$/, "")}.${ref.media_type === "image/png" ? "png" : "jpg"}` : ref.name;
      link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) { console.error("[attachments] Download failed.", { sessionId, attachmentId: ref.id, error }); toast.error(content.downloadFailed); }
    finally { setDownloading(false); }
  }
  return <div className="relative shrink-0" data-attachment-id={ref.id}>
    {ref.kind === "image" ? <Button type="button" variant="ghost" className="size-[60px] overflow-hidden rounded-lg border border-border bg-accent p-0" disabled={url === null} onClick={() => setPreview(true)} aria-label={content.preview(ref.name)} title={ref.name}>
      {url !== null ? <img src={url} alt={ref.name} className="size-full object-cover" /> : failed ? <span className="px-1 text-[10px] text-destructive">{content.previewFailed}</span> : <LoaderCircle className="size-4 animate-spin" />}
    </Button> : <Button type="button" variant="ghost" onClick={() => void download()} disabled={downloading} className="flex h-[60px] max-w-[250px] gap-3 rounded-lg border border-border bg-accent px-3 text-left" title={ref.name} aria-label={content.download(ref.name)}>
      {downloading ? <LoaderCircle className="size-7 shrink-0 animate-spin" /> : <FileText className="size-7 shrink-0 text-muted-foreground" strokeWidth={1.5} />}
      <span className="flex min-w-0 flex-col gap-0.5"><span className="max-w-[150px] truncate text-[13px] font-normal">{ref.name}</span><span className="text-[11px] font-normal text-muted-foreground">{formatBytes(ref.bytes)}</span></span>
    </Button>}
    {onRemove !== undefined && <button type="button" disabled={disabled} aria-label={content.remove(ref.name)} onClick={() => onRemove(ref.id)} className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground disabled:opacity-50"><X className="size-2.5" /></button>}
    <AlertDialog open={preview} onOpenChange={setPreview}><AlertDialogContent className="max-w-3xl gap-3 p-4">
      <div className="flex items-center justify-between gap-3"><AlertDialogTitle className="truncate text-sm">{ref.name}</AlertDialogTitle><AlertDialogCancel asChild><Button type="button" size="icon" variant="ghost" aria-label={content.close}><X className="size-4" /></Button></AlertDialogCancel></div>
      <AlertDialogDescription>{ref.kind === "image" ? `${ref.width} × ${ref.height} · ${formatBytes(ref.bytes)}` : formatBytes(ref.bytes)}</AlertDialogDescription>
      {url !== null && <img src={url} alt={ref.name} className="max-h-[65vh] w-full object-contain" />}
      <Button type="button" variant="outline" size="sm" disabled={downloading} onClick={() => void download()}><Download className="size-3.5" />{content.downloadLabel}</Button>
    </AlertDialogContent></AlertDialog>
  </div>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
