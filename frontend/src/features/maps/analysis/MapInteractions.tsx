import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AnalysisOutput, MapLayer } from "@/features/analysis/api";
import { PixelInteraction } from "@/features/maps/analysis/PixelInteraction";
import { RegionInteraction } from "@/features/maps/analysis/RegionInteraction";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { interactionCopy as copy } from "@/locales/zh-CN/map-interactions";

export interface MapInteraction {
  readonly layerId: string;
  readonly mode: "pixel" | "region" | "compare";
}
export function MapInteractions({
  value,
  map,
  workspaceId,
  sessionId,
  layers,
  outputs,
  pair,
  onPair,
  onChange,
  onClose,
}: {
  readonly value: MapInteraction;
  readonly map: ReturnType<typeof useSessionMap>;
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly layers: readonly MapLayer[];
  readonly outputs: readonly AnalysisOutput[];
  readonly pair: readonly [string, string] | null;
  readonly onPair: (value: readonly [string, string] | null) => void;
  readonly onChange: (value: MapInteraction) => void;
  readonly onClose: () => void;
}) {
  const layer = layers.find((item) => item.id === value.layerId);
  if (layer === undefined) return null;
  const props = { map, workspaceId, sessionId, layer, outputs };
  return (
    <aside
      aria-label={copy[value.mode]}
      className="absolute top-4 right-16 z-20 flex max-h-[calc(100%-var(--map-overlay-height,180px)-2rem)] w-80 max-w-[calc(100%-5rem)] flex-col rounded-xl border border-border bg-background/95 shadow-sm backdrop-blur"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-sm font-medium">{copy[value.mode]}</p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={copy.close}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 space-y-3 overflow-y-auto p-3">
        <label className="block space-y-1 text-xs text-muted-foreground">
          {value.mode === "compare" ? copy.left : copy.layer}
          <select
            aria-label={value.mode === "compare" ? copy.left : copy.layer}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={layer.id}
            onChange={(event) => {
              onPair(null);
              onChange({ ...value, layerId: event.target.value });
            }}
          >
            {layers
              .filter((item) => item.visible && item.bounds !== null &&
                (value.mode !== "pixel" || item.output_id !== null))
              .map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
          </select>
        </label>
        {value.mode === "pixel" && (
          <PixelInteraction key={layer.id} {...props} />
        )}
        {value.mode === "region" && (
          <RegionInteraction key={layer.id} {...props} />
        )}
        {value.mode === "compare" && (
          <ComparisonControls
            key={layer.id}
            layer={layer}
            layers={layers}
            pair={pair}
            onPair={onPair}
          />
        )}
      </div>
    </aside>
  );
}
function ComparisonControls({
  layer,
  layers,
  pair,
  onPair,
}: {
  readonly layer: MapLayer;
  readonly layers: readonly MapLayer[];
  readonly pair: readonly [string, string] | null;
  readonly onPair: (value: readonly [string, string] | null) => void;
}) {
  const [right, setRight] = useState(pair?.[0] === layer.id ? pair[1] : "");
  const selectedRight = pair?.[1] ?? right;
  return (
    <div className="space-y-2 text-xs">
      <label className="block space-y-1">
        {copy.right}
        <select
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          value={selectedRight}
          onChange={(event) => {
            onPair(null);
            setRight(event.target.value);
          }}
        >
          <option value="">{copy.select}</option>
          {layers
            .filter((item) => item.id !== layer.id && item.visible && item.bounds !== null)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
        </select>
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={pair === null && !layers.some(item => item.id === selectedRight && item.id !== layer.id && item.visible && item.bounds !== null)}
        onClick={() => {
          setRight(selectedRight);
          onPair(pair === null ? [layer.id, selectedRight] : null);
        }}
      >
        {pair === null ? copy.swipeStart : copy.swipeStop}
      </Button>
      {pair !== null && <p className="text-muted-foreground">{copy.dragDivider}</p>}
    </div>
  );
}
