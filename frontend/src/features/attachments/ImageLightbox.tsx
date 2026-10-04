import { Minus, Plus, X } from "lucide-react";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";

export function ImageLightbox({ src, name, description, onClose, onError, action }: {
  readonly src: string; readonly name: string; readonly description: string;
  readonly onClose: () => void; readonly onError: () => void; readonly action?: ReactNode;
}) {
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(100);
  useLayoutEffect(() => {
    const element = stage;
    if (element === null) return;
    const measure = () => setAvailable({ width: element.offsetWidth, height: element.offsetHeight });
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, [stage]);
  const fit = natural.width === 0 ? 0 : Math.min(available.width / natural.width, available.height / natural.height);
  const width = natural.width * fit * zoom / 100;
  const height = natural.height * fit * zoom / 100;
  return <AlertDialog open onOpenChange={open => { if (!open) onClose(); }}><AlertDialogContent className="grid h-[85vh] max-w-[calc(100vw-2rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 p-4 sm:max-w-[90vw]">
    <div className="flex min-w-0 items-center justify-between gap-3"><AlertDialogTitle className="truncate text-sm">{name}</AlertDialogTitle><AlertDialogCancel asChild><Button type="button" size="icon" variant="ghost" aria-label={zhCN.conversation.attachments.close}><X className="size-4" /></Button></AlertDialogCancel></div>
    <AlertDialogDescription className="truncate">{description}</AlertDialogDescription>
    <div ref={setStage} className="min-h-0 min-w-0 overflow-auto" data-image-lightbox-stage><div className="grid min-h-full min-w-full place-items-center" style={{ width: Math.max(width, available.width), height: Math.max(height, available.height) }}>
      <img src={src} alt={name} className="max-w-none object-contain" style={{ width, height }} onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={onError} />
    </div></div>
    <div className="flex flex-wrap items-center justify-center gap-3"><Button variant="ghost" size="icon" className="size-8" aria-label={zhCN.filePreview.zoomOut} disabled={zoom === 25} onClick={() => setZoom(value => Math.max(25, value - 25))}><Minus className="size-4" /></Button><button type="button" className="min-w-12 text-xs" aria-label={zhCN.filePreview.resetZoom} onClick={() => setZoom(100)}>{zoom}%</button><Button variant="ghost" size="icon" className="size-8" aria-label={zhCN.filePreview.zoomIn} disabled={zoom === 400} onClick={() => setZoom(value => Math.min(400, value + 25))}><Plus className="size-4" /></Button>{action}</div>
  </AlertDialogContent></AlertDialog>;
}
