import { Button } from "@/components/ui/button";
import type { MapLayer } from "@/features/analysis/api";
import { useOutputImage } from "@/features/analysis/useOutputImage";
import { zhCN } from "@/locales/zh-CN";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Eye,
  EyeOff,
  GripVertical,
  ImageOff,
  LocateFixed,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

const content = zhCN.analysis;
export type LayerAction =
  | { readonly kind: "select" | "focus" | "visibility" | "remove" }
  | { readonly kind: "opacity"; readonly value: number }
  | { readonly kind: "reorder"; readonly position: number };

export function LayerRow({ workspaceId, layer, selected, disabled, onAction }: {
  readonly workspaceId: string;
  readonly layer: MapLayer;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onAction: (action: LayerAction) => void;
}) {
  const [opacity, setOpacity] = useState(layer.opacity);
  useEffect(() => { if (!disabled) setOpacity(layer.opacity); }, [layer.opacity, disabled]);
  const image = useOutputImage(workspaceId, layer.output_id);
  const sortable = useSortable({ id: layer.id, disabled });
  return <section
    ref={sortable.setNodeRef}
    style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, zIndex: sortable.isDragging ? 1 : undefined, position: "relative" }}
    className={`space-y-2 rounded-lg border bg-background p-2 ${selected ? "border-foreground/40" : "border-border"} ${sortable.isDragging ? "opacity-60" : ""}`}
  >
    <div className="flex items-center gap-2">
      <button type="button" ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners} disabled={disabled}
        className="flex h-12 w-4 shrink-0 touch-none items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        aria-label={`${content.reorder} · ${layer.title}`} title={content.reorder}>
        <GripVertical className="size-3.5" />
      </button>
      <button type="button" disabled={disabled} onClick={() => onAction({ kind: "select" })} aria-label={layer.title} aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-2 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          {image.url !== null ? <img src={image.url} alt={content.previewAlt} className="size-full object-contain" />
            : image.error ? <ImageOff className="size-4 text-muted-foreground" aria-label={content.previewFailed} />
              : <span className="size-5 animate-pulse rounded bg-border" aria-label={content.loading} />}
        </span>
        <span className="line-clamp-2 text-xs font-medium" title={layer.title}>{layer.title}</span>
      </button>
      <Button size="icon" className="size-6 shrink-0" variant="ghost" disabled={disabled} aria-label={content.show} aria-pressed={layer.visible} onClick={() => onAction({ kind: "visibility" })}>
        {layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </Button>
    </div>
    <div className="flex items-center gap-1 pl-6">
      <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted-foreground">
        <span className="sr-only">{content.opacity}</span>
        <input aria-label={content.opacity} type="range" className="min-w-0 flex-1 accent-foreground" min="0" max="1" step="0.05" value={opacity} disabled={disabled}
          onChange={(event) => setOpacity(Number(event.target.value))}
          onPointerCancel={() => setOpacity(layer.opacity)}
          onPointerUp={() => { if (opacity !== layer.opacity) onAction({ kind: "opacity", value: opacity }); }}
          onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key) && opacity !== layer.opacity) onAction({ kind: "opacity", value: opacity }); }} />
        <span className="w-8 text-right tabular-nums">{Math.round(opacity * 100)}%</span>
      </label>
      <Button size="icon" className="size-6" variant="ghost" aria-label={content.focus} disabled={disabled} onClick={() => onAction({ kind: "focus" })}><LocateFixed className="size-3.5" /></Button>
      <Button size="icon" className="size-6" variant="ghost" aria-label={content.remove} disabled={disabled} onClick={() => onAction({ kind: "remove" })}><Trash2 className="size-3.5" /></Button>
    </div>
  </section>;
}
