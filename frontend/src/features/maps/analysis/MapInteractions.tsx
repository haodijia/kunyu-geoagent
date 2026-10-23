import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppUiStore } from "@/app/store";
import type { AnalysisOutput, MapLayer } from "@/features/analysis/api";
import { PixelInteraction } from "@/features/maps/analysis/PixelInteraction";
import { RegionInteraction } from "@/features/maps/analysis/RegionInteraction";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { interactionCopy as copy } from "@/locales/zh-CN/map-interactions";

export interface MapInteraction {
  readonly layerId: string | null;
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
  const layer = layers.find((item) => item.id === value.layerId) ?? null;
  const eligible = layers.filter(item =>
    item.bounds !== null && (value.mode !== "pixel" || item.output_id !== null));
  const props = { map, workspaceId, sessionId, layer, outputs };
  return (
    <aside
      aria-label={copy[value.mode]}
      className="flex min-h-0 shrink-0 flex-col rounded-xl border border-border bg-background/95 shadow-sm backdrop-blur"
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
        {value.mode !== "compare" && eligible.length > 0 && (
          <label className="block space-y-1 text-xs text-muted-foreground">
            {copy.layer}
            <select
              aria-label={copy.layer}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
              value={layer?.id ?? ""}
              onChange={(event) => {
                onPair(null);
                const layerId = event.target.value === "" ? null : event.target.value;
                const store = useAppUiStore.getState();
                const selection = store.mapContextBySession[sessionId]?.selection;
                if (value.mode === "region" && selection != null && selection.geometry.type !== "Point")
                  store.setMapSelection(sessionId, { ...selection, layer_id: layerId });
                onChange({ ...value, layerId });
              }}
            >
              <option value="">{copy.select}</option>
              {eligible.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </label>
        )}
        {value.mode === "pixel" && layer !== null && (
          <PixelInteraction key={layer.id} {...props} />
        )}
        {value.mode === "pixel" && layer === null && <p className="text-xs text-muted-foreground">{copy.noRaster}</p>}
        {value.mode === "region" && (
          <RegionInteraction key={layer?.id ?? "region"} {...props} />
        )}
        {value.mode === "compare" && (
          <ComparisonControls
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
  layers,
  pair,
  onPair,
}: {
  readonly layers: readonly MapLayer[];
  readonly pair: readonly [string, string] | null;
  readonly onPair: (value: readonly [string, string] | null) => void;
}) {
  const [choice, setChoice] = useState<readonly [string, string]>(pair ?? ["", ""]);
  const selected = pair ?? choice;
  const eligible = layers.filter(item => item.bounds !== null);
  const valid = selected[0] !== selected[1] && selected.every(id => eligible.some(layer => layer.id === id));
  return (
    <div className="space-y-2 text-xs">
      <p className="text-muted-foreground">{eligible.length < 2 ? copy.comparisonEmpty : copy.comparisonHint}</p>
      {([0, 1] as const).map(index => (
        <label key={index} className="block space-y-1">
          {index === 0 ? copy.left : copy.right}
          <select
            aria-label={index === 0 ? copy.left : copy.right}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            value={selected[index]}
            onChange={(event) => {
              onPair(null);
              setChoice(index === 0 ? [event.target.value, selected[1]] : [selected[0], event.target.value]);
            }}
          >
            <option value="">{copy.select}</option>
            {eligible
              .filter((item) => item.id !== selected[index === 0 ? 1 : 0])
              .map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
          </select>
        </label>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={pair === null && !valid}
        onClick={() => {
          setChoice(selected);
          onPair(pair === null ? selected : null);
        }}
      >
        {pair === null ? copy.swipeStart : copy.swipeStop}
      </Button>
      {pair !== null && <p className="text-muted-foreground">{copy.dragDivider}</p>}
    </div>
  );
}
