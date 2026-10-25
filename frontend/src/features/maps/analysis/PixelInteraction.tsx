import { MapToolHint } from "@/features/maps/analysis/MapToolHint";
import type { MapMouseEvent } from "maplibre-gl";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crosshair, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AnalysisOutput, MapLayer } from "@/features/analysis/api";
import { rasterApi } from "@/features/analysis/raster";
import { useAppUiStore } from "@/app/store";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { interactionCopy as copy } from "@/locales/zh-CN/map-interactions";

export interface InteractionProps {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly layer: MapLayer | null;
  readonly outputs: readonly AnalysisOutput[];
  readonly map: ReturnType<typeof useSessionMap>;
}

export function PixelInteraction({
  workspaceId,
  sessionId,
  layer,
  map,
}: InteractionProps) {
  const selection = useAppUiStore(
    (state) => state.mapContextBySession[sessionId]?.selection,
  );
  const point =
    selection?.geometry.type === "Point"
      ? selection.geometry.coordinates
      : null;
  const outputId = layer?.output_id ?? null;
  const layerId = layer?.id ?? null;
  const instance = map.getMap();
  const query = useQuery({
    queryKey: [
      "map-pixel",
      workspaceId,
      outputId,
      layer?.view_id,
      layer?.revision,
      point,
    ],
    enabled: point !== null && outputId !== null,
    retry: false,
    queryFn: ({ signal }) => {
      if (point === null || outputId === null) throw new Error(copy.noRaster);
      return rasterApi.sample(
        workspaceId,
        outputId,
        point[0]!,
        point[1]!,
        signal,
        layer!.view_id!,
      );
    },
  });
  const sample = query.data ?? null;
  const error = query.error?.message ?? null;
  useEffect(() => {
    if (query.isError) console.error("[map] Pixel query failed", query.error);
  }, [query.isError, query.error]);
  useEffect(() => {
    if (selection?.geometry.type === "Point" && selection.layer_id !== layerId)
      useAppUiStore.getState().setMapSelection(sessionId, {
        geometry: selection.geometry,
        layer_id: layerId,
      });
  }, [selection, layerId, sessionId]);
  useEffect(() => {
    if (instance === null || !map.ready || outputId === null) return;
    const click = (event: MapMouseEvent) => {
      const coordinates: [number, number] = [
        event.lngLat.wrap().lng,
        event.lngLat.lat,
      ];
      useAppUiStore.getState().setMapSelection(sessionId, {
        geometry: { type: "Point", coordinates },
        layer_id: layerId,
      });
    };
    instance.on("click", click);
    return () => {
      instance.off("click", click);
    };
  }, [instance, map.ready, outputId, sessionId, layerId]);

  return (
    <>
      <MapToolHint map={map}>
        <Crosshair className="size-3.5 shrink-0" />
        <span>{outputId === null ? copy.noRaster : copy.pixelHint}</span>
        {layer !== null && (
          <span className="map-tool-target" title={layer.title}>
            {layer.title}
          </span>
        )}
      </MapToolHint>
      {point !== null && selection?.geometry.type === "Point" && (
        <section className="map-inspection" aria-label={copy.pixel}>
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <Crosshair className="size-3.5 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {layer?.title}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={copy.clear}
              onClick={() => {
                useAppUiStore.getState().setMapSelection(sessionId, null);
              }}
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="space-y-2 p-3 text-xs">
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {point[0]!.toFixed(5)}°, {point[1]!.toFixed(5)}°
            </p>
            {sample !== null && (
              <div
                className="max-h-40 space-y-1.5 overflow-y-auto"
                role="status"
              >
                {!sample.inside ? (
                  <p>{copy.outside}</p>
                ) : (
                  sample.values.map((value, index) => {
                    const category = sample.categories?.find(
                      (entry) => entry.value === value,
                    );
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="truncate text-muted-foreground">
                          {sample.bands[index] ?? copy.band(index + 1)}
                          {sample.units[index] == null
                            ? ""
                            : ` · ${sample.units[index]}`}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 font-medium tabular-nums">
                          {category !== undefined && (
                            <span
                              className="size-2 rounded-full"
                              style={{ background: category.color }}
                            />
                          )}
                          {value === null
                            ? copy.noData
                            : (category?.label ??
                              Number(value.toPrecision(6)).toString())}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
            {outputId === null && <p>{copy.noRaster}</p>}
            {outputId !== null && sample === null && error === null && (
              <p
                role="status"
                className="flex items-center gap-2 text-muted-foreground"
              >
                <LoaderCircle className="size-3 animate-spin" />
                {copy.loading}
              </p>
            )}
            {error !== null && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <p className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
              {copy.attachedHint}
            </p>
          </div>
        </section>
      )}
    </>
  );
}
