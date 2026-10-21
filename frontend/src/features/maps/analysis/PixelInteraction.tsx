import type { MapMouseEvent } from "maplibre-gl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AnalysisOutput, MapLayer } from "@/features/analysis/api";
import { rasterApi, type RasterSample } from "@/features/analysis/raster";
import { referenceSelection } from "@/features/maps/analysis/selection-reference";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { interactionCopy as copy } from "@/locales/zh-CN/map-interactions";

export interface InteractionProps {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly layer: MapLayer;
  readonly outputs: readonly AnalysisOutput[];
  readonly map: ReturnType<typeof useSessionMap>;
}
export function PixelInteraction({
  workspaceId,
  sessionId,
  layer,
  outputs,
  map,
}: InteractionProps) {
  const [point, setPoint] = useState<readonly [number, number] | null>(null);
  const [sample, setSample] = useState<RasterSample | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const instance = map.getMap();
  useEffect(() => {
    if (instance === null || !map.ready || layer.output_id === null) return;
    let pending: AbortController | null = null;
    const cursor = instance.getCanvas().style.cursor;
    instance.getCanvas().style.cursor = "crosshair";
    const click = (event: MapMouseEvent) => {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      setPoint([event.lngLat.lng, event.lngLat.lat]);
      setSample(null);
      setSaved(false);
      setError(null);
      void rasterApi
        .sample(
          workspaceId,
          layer.output_id!,
          event.lngLat.lng,
          event.lngLat.lat,
          controller.signal,
        )
        .then((value) => {
          if (!controller.signal.aborted) setSample(value);
        })
        .catch((reason) => {
          if (!controller.signal.aborted) {
            console.error("[map] Pixel query failed", reason);
            setError(reason.message);
          }
        });
    };
    instance.on("click", click);
    return () => {
      pending?.abort();
      instance.off("click", click);
      instance.getCanvas().style.cursor = cursor;
    };
  }, [instance, map.ready, workspaceId, layer.output_id]);
  async function reference() {
    if (point === null) return;
    setSaving(true);
    setError(null);
    try {
      await referenceSelection(
        workspaceId,
        sessionId,
        copy.point,
        layer,
        { type: "Point", coordinates: [...point] },
        outputs,
      );
      setSaved(true);
    } catch (reason) {
      console.error("[map] Referencing point failed", reason);
      setError(reason instanceof Error ? reason.message : copy.failedRequest);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-2 text-xs">
      <p className="text-muted-foreground">{copy.pixelHint}</p>
      {point !== null && (
        <p>
          {point[0].toFixed(6)}, {point[1].toFixed(6)}
        </p>
      )}
      {sample !== null && (
        <div role="status">
          {!sample.inside
            ? copy.outside
            : sample.values.map((value, index) => (
                <p key={index}>
                  {sample.bands[index] ?? `Band ${index + 1}`}:{" "}
                  {value === null ? copy.noData : value.toPrecision(6)}
                </p>
              ))}
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={sample === null || !sample.inside || saving || saved}
        onClick={() => void reference()}
      >
        {copy.send}
      </Button>
      {saved && (
        <p role="status" className="text-muted-foreground">
          {copy.saved}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
