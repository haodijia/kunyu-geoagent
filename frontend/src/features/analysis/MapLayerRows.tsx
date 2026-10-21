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
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

const content = zhCN.analysis;
export type LayerMutation =
  | { readonly kind: "visibility" | "remove" }
  | { readonly kind: "opacity"; readonly value: number }
  | { readonly kind: "reorder"; readonly position: number };
export type LayerAction =
  | LayerMutation
  | { readonly kind: "focus" }
  | { readonly kind: "reference" }
  | { readonly kind: "pixel" }
  | { readonly kind: "region" }
  | { readonly kind: "compare" };

export function LayerRow({
  sessionId,
  layer,
  expanded,
  disabled,
  onInspect,
  onAction,
  status,
}: {
  readonly sessionId: string;
  readonly layer: MapLayer;
  readonly expanded: boolean;
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
      className={`space-y-2 rounded-lg border bg-background p-2 ${expanded ? "border-foreground/40" : "border-border"} ${sortable.isDragging ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          disabled={disabled}
          className="flex h-12 w-4 shrink-0 touch-none items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          aria-label={`${content.reorder} · ${layer.title}`}
          title={content.reorder}
        >
          <GripVertical className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onInspect}
          aria-label={layer.title}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
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
            {layer.visible && status !== undefined && (
              <span
                className={`block text-[11px] ${status.state === "failed" ? "text-destructive" : "text-muted-foreground"}`}
              >
                {status.state === "ready"
                  ? content.renderReady
                  : status.state === "failed"
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
      {expanded && (
        <div className="space-y-1 pl-6 text-[11px] text-muted-foreground">
          {image.url !== null && (
            <img
              src={image.url}
              alt={content.previewAlt}
              className="max-h-48 w-full rounded object-contain"
            />
          )}
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAction({ kind: "reference" })}
            >
              {content.continueQuestion}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={layer.output_id === null}
              onClick={() => onAction({ kind: "pixel" })}
            >
              {content.queryPixel}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAction({ kind: "region" })}
            >
              {content.selectRegion}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!layer.visible}
              onClick={() => onAction({ kind: "compare" })}
            >
              {content.compare}
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-1 pl-6">
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
    </section>
  );
}
