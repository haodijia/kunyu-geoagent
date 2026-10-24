import { rasterCategories } from "@/features/analysis/raster";
import { Button } from "@/components/ui/button";
import type { LayerStatus } from "@/features/maps/analysis/useMapStatus";
import type { MapLayer } from "@/features/analysis/api";
import { useLayerPreview } from "@/features/maps/layers/useLayerPreview";
import { zhCN } from "@/locales/zh-CN";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Eye,
  EyeOff,
  GripVertical,
  ImageOff,
  LocateFixed,
  MessageSquarePlus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

const content = zhCN.analysis;
export type LayerMutation =
  | { readonly kind: "visibility" | "remove" }
  | { readonly kind: "opacity"; readonly value: number }
  | { readonly kind: "reorder"; readonly position: number };
export type LayerAction =
  LayerMutation | { readonly kind: "focus" } | { readonly kind: "reference" };

export function LayerRow({
  sessionId,
  layer,
  selected,
  disabled,
  onInspect,
  onAction,
  status,
  metadata,
}: {
  readonly metadata: Readonly<Record<string, unknown>> | undefined;
  readonly sessionId: string;
  readonly layer: MapLayer;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onInspect: () => void;
  readonly onAction: (action: LayerAction) => void;
  readonly status: LayerStatus | undefined;
}) {
  const [opacity, setOpacity] = useState(layer.opacity);
  useEffect(() => {
    if (!disabled) setOpacity(layer.opacity);
  }, [layer.opacity, disabled]);
  const image = useLayerPreview(sessionId, layer.id);
  const sortable = useSortable({ id: layer.id, disabled });
  return (
    <section
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        zIndex: sortable.isDragging ? 1 : undefined,
        position: "relative",
      }}
      className={`group space-y-2 rounded-lg border p-2 transition-colors ${selected ? "border-border bg-muted/60" : "border-transparent hover:bg-muted/40"} ${sortable.isDragging ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          disabled={disabled}
          className="flex h-8 w-3 shrink-0 touch-none items-center justify-center rounded text-muted-foreground/50 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          aria-label={`${content.reorder} · ${layer.title}`}
          title={content.reorder}
        >
          <GripVertical className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onInspect}
          aria-label={layer.title}
          aria-pressed={selected}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
            {image.url !== null ? (
              <img
                src={image.url}
                alt={content.previewAlt}
                className="size-full object-contain"
              />
            ) : image.error ? (
              <ImageOff
                className="size-4 text-muted-foreground"
                aria-label={content.previewFailed}
              />
            ) : (
              <span
                className="size-5 animate-pulse rounded bg-border"
                aria-label={content.loading}
              />
            )}
          </span>
          <span className="min-w-0 space-y-1">
            <span
              className="block line-clamp-2 text-xs font-medium"
              title={layer.title}
            >
              {layer.title}
            </span>
            {layer.image !== null && (
              <span className="block text-[11px] text-muted-foreground">
                {layer.image.resolution === null
                  ? zhCN.mapConversation.unknownResolution
                  : `${layer.image.resolution}${content.metres}`}{" "}
                ·{" "}
                {layer.image.cloud === null
                  ? content.unknownCloud
                  : zhCN.mapConversation.cloud(layer.image.cloud)}
              </span>
            )}
            {layer.visible &&
              status !== undefined &&
              status.state !== "ready" && (
                <span
                  className={`block text-[11px] ${status.state === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {status.state === "failed"
                    ? content.renderFailed
                    : content.renderLoading}
                </span>
              )}
            {layer.bounds === null && (
              <span className="block text-[11px] text-destructive">
                {zhCN.mapConversation.noFootprint}
              </span>
            )}
          </span>
        </button>
        <Button
          size="icon"
          className="size-6 shrink-0"
          variant="ghost"
          disabled={disabled}
          aria-label={content.show}
          aria-pressed={layer.visible}
          onClick={() => onAction({ kind: "visibility" })}
        >
          {layer.visible ? (
            <Eye className="size-3.5" />
          ) : (
            <EyeOff className="size-3.5" />
          )}
        </Button>
      </div>
      {selected && (
        <div className="flex items-center gap-1 pl-5">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted-foreground">
            <span className="sr-only">{content.opacity}</span>
            <input
              aria-label={content.opacity}
              type="range"
              className="min-w-0 flex-1 accent-foreground"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              disabled={disabled}
              onChange={(event) => setOpacity(Number(event.target.value))}
              onPointerCancel={() => setOpacity(layer.opacity)}
              onPointerUp={() => {
                if (opacity !== layer.opacity)
                  onAction({ kind: "opacity", value: opacity });
              }}
              onKeyUp={(event) => {
                if (
                  [
                    "ArrowLeft",
                    "ArrowRight",
                    "Home",
                    "End",
                    "ArrowUp",
                    "ArrowDown",
                  ].includes(event.key) &&
                  opacity !== layer.opacity
                )
                  onAction({ kind: "opacity", value: opacity });
              }}
            />
            <span className="w-8 text-right tabular-nums">
              {Math.round(opacity * 100)}%
            </span>
          </label>
          <Button
            size="icon"
            className="size-6"
            variant="ghost"
            aria-label={content.continueQuestion}
            onClick={() => onAction({ kind: "reference" })}
          >
            <MessageSquarePlus className="size-3.5" />
          </Button>
          <Button
            size="icon"
            className="size-6"
            variant="ghost"
            aria-label={content.focus}
            disabled={layer.bounds === null}
            onClick={() => onAction({ kind: "focus" })}
          >
            <LocateFixed className="size-3.5" />
          </Button>
          <Button
            size="icon"
            className="size-6"
            variant="ghost"
            aria-label={content.remove}
            disabled={disabled}
            onClick={() => onAction({ kind: "remove" })}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}
      {selected && metadata !== undefined && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pl-5 text-[10px] text-muted-foreground">
          {rasterCategories(metadata).map((category) => (
            <span key={category.value} className="flex items-center gap-1">
              <span
                className="size-2 rounded-sm"
                style={{ background: category.color }}
              />
              {category.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
