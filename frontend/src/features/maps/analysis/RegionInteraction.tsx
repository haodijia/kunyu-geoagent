import { MapToolHint } from "@/features/maps/analysis/MapToolHint";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Pentagon, SquareDashed, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { rasterApi, type RegionGeometry } from "@/features/analysis/raster";
import type { InteractionProps } from "@/features/maps/analysis/PixelInteraction";
import { useMapDrawing } from "@/features/maps/analysis/useMapDrawing";
import { useAppUiStore } from "@/app/store";
import { interactionCopy as copy } from "@/locales/zh-CN/map-interactions";

function importedGeometry(value: unknown): RegionGeometry {
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    "crs" in value
  )
    throw new Error(copy.invalidImport);
  if (value.type === "Feature" && "geometry" in value)
    return importedGeometry(value.geometry);
  if (
    (value.type === "Polygon" || value.type === "MultiPolygon") &&
    "coordinates" in value &&
    Array.isArray(value.coordinates)
  )
    return {
      type: value.type,
      coordinates: value.coordinates,
    } as RegionGeometry;
  throw new Error(copy.invalidImport);
}

export function RegionInteraction({
  workspaceId,
  sessionId,
  layer,
  outputs,
  map,
}: InteractionProps) {
  const selection = useAppUiStore(
    (state) => state.mapContextBySession[sessionId]?.selection,
  );
  const geometry =
    selection != null && selection.geometry.type !== "Point"
      ? selection.geometry
      : null;
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const output = outputs.find((item) => item.id === layer?.output_id);
  const complete = useCallback(
    (value: RegionGeometry) => {
      useAppUiStore.getState().setMapSelection(sessionId, {
        geometry: value,
        layer_id: layer?.id ?? null,
      });
      setError(null);
    },
    [sessionId, layer?.id],
  );
  const drawing = useMapDrawing(map.getMap(), map.ready, complete);
  const stats = useQuery({
    queryKey: [
      "map-region-statistics",
      workspaceId,
      output?.id,
      layer?.view_id,
      layer?.revision,
      geometry,
    ],
    enabled: geometry !== null && output !== undefined,
    retry: false,
    queryFn: ({ signal }) => {
      if (geometry === null || output === undefined)
        throw new Error(copy.noRaster);
      return rasterApi.statistics(
        workspaceId,
        output.id,
        geometry,
        layer!.view_id!,
        signal,
      );
    },
  });
  useEffect(() => {
    if (
      geometry !== null &&
      selection != null &&
      selection.layer_id !== (layer?.id ?? null)
    )
      useAppUiStore
        .getState()
        .setMapSelection(sessionId, { geometry, layer_id: layer?.id ?? null });
  }, [geometry, selection, sessionId, layer?.id]);
  useEffect(() => {
    if (stats.isError)
      console.error("[map] Region statistics failed", stats.error);
  }, [stats.isError, stats.error]);
  return (
    <>
      <MapToolHint map={map}>
        {(
          [
            { mode: "rectangle", Icon: SquareDashed, title: copy.rectangle },
            { mode: "polygon", Icon: Pentagon, title: copy.polygon },
          ] as const
        ).map(({ mode, Icon, title }) => (
          <Tooltip key={mode} label={title}>
            <Button
              variant={drawing.mode === mode ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={title}
              aria-pressed={drawing.mode === mode}
              onClick={() => drawing.setMode(mode)}
            >
              <Icon className="size-3.5" />
            </Button>
          </Tooltip>
        ))}
        <span className="map-tool-divider" />
        <span role="status">
          {drawing.mode === "rectangle" ? copy.drawRectangle : copy.drawPolygon}
        </span>
        <Tooltip label={copy.import}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={copy.import}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-3.5" />
          </Button>
        </Tooltip>
        <input
          type="file"
          ref={fileInput}
          className="hidden"
          accept=".json,.geojson"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file === undefined) return;
            if (file.size > 2 * 1024 * 1024) {
              setError(copy.invalidImport);
              return;
            }
            void file
              .text()
              .then((text) => complete(importedGeometry(JSON.parse(text))))
              .catch((reason: unknown) => {
                console.error("[map] Region import failed", reason);
                setError(copy.invalidImport);
              });
          }}
        />
      </MapToolHint>
      {(geometry !== null || error !== null) && (
        <section className="map-inspection" aria-label={copy.region}>
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <SquareDashed className="size-3.5 text-muted-foreground" />
            <span className="flex-1 text-xs font-medium">
              {copy.selectedRegion}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={copy.clear}
              onClick={() => {
                useAppUiStore.getState().setMapSelection(sessionId, null);
                setError(null);
              }}
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="space-y-2 p-3 text-xs">
            {layer !== null && (
              <p
                className="truncate text-[11px] text-muted-foreground"
                title={layer.title}
              >
                {layer.title}
              </p>
            )}
            {stats.isFetching && (
              <p
                className="flex items-center gap-2 text-muted-foreground"
                role="status"
              >
                <LoaderCircle className="size-3 animate-spin" />
                {copy.calculating}
              </p>
            )}
            {stats.data !== undefined && (
              <div className="max-h-44 space-y-2 overflow-y-auto" role="status">
                <p className="text-xl font-medium tracking-tight tabular-nums">
                  {(stats.data.bands[0]!.region_area_m2 / 1e6).toFixed(3)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    km²
                  </span>
                </p>
                {stats.data.bands.map((measurement) => (
                  <div className="space-y-2" key={measurement.band}>
                    <p className="font-medium">
                      {measurement.title}
                      {measurement.unit === null
                        ? ""
                        : ` · ${measurement.unit}`}
                    </p>
                    {measurement.classes.map((value) => (
                      <div
                        key={value.value}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full"
                            style={{ background: value.color }}
                          />
                          {value.label}
                        </span>
                        <span className="tabular-nums">
                          {(value.area_m2 / 1e6).toFixed(3)} km²
                        </span>
                      </div>
                    ))}
                    {measurement.mean !== null &&
                      measurement.classes.length === 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            [copy.min, measurement.minimum],
                            [copy.max, measurement.maximum],
                            [copy.mean, measurement.mean],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <p className="text-[10px] text-muted-foreground">
                                {label}
                              </p>
                              <p className="mt-1 tabular-nums">
                                {typeof value === "number"
                                  ? Number(value.toPrecision(5))
                                  : copy.noData}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    <p className="text-[11px] text-muted-foreground">
                      {copy.validPixels}{" "}
                      {measurement.valid_pixel_count.toLocaleString()} /{" "}
                      {measurement.selected_pixel_count.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {(error !== null || stats.isError) && (
              <p role="alert" className="text-destructive">
                {error ?? stats.error?.message}
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
