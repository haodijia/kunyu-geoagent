import { useAppUiStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { rasterApi, type RegionGeometry } from "@/features/analysis/raster";
import { MapToolHint } from "@/features/maps/analysis/MapToolHint";
import type { InteractionProps } from "@/features/maps/analysis/PixelInteraction";
import { useMapDrawing } from "@/features/maps/analysis/useMapDrawing";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { interactionCopy as copy } from "@/locales/zh-CN/map-interactions";
import { useQuery } from "@tanstack/vue-query";
import {
  LoaderCircle,
  Pentagon,
  SquareDashed,
  Upload,
  X,
} from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
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
export const RegionInteraction = defineComponent(
  (componentProps: InteractionProps, { slots: _slots }) => {
    const workspaceId = computed(() => componentProps.workspaceId),
      sessionId = computed(() => componentProps.sessionId),
      layer = computed(() => componentProps.layer),
      outputs = computed(() => componentProps.outputs),
      map = computed(() => componentProps.map);
    const selection = computed(() =>
      ((state) => state.mapContextBySession[sessionId.value]?.selection)(
        useAppUiStore(),
      ),
    );
    const geometry = computed(() => {
      const drawing = selection.value?.geometry;
      return drawing && drawing.type !== "Point" ? drawing : null;
    });
    const error = shallowRef<string | null>(null),
      setError = refSetter(error);
    const fileInput = shallowRef<HTMLInputElement | null>(null);
    const output = computed(() =>
      outputs.value.find((item) => item.id === layer.value?.output_id),
    );
    const complete = (value: RegionGeometry) => {
      useAppUiStore().setMapSelection(sessionId.value, {
        geometry: value,
        layer_id: layer.value?.id ?? null,
      });
      setError(null);
    };
    const drawing = useMapDrawing(
      () => map.value.getMap(),
      () => map.value.ready,
      complete,
    );
    const stats = reactive(
      useQuery(
        computed(() => ({
          queryKey: [
            "map-region-statistics",
            workspaceId.value,
            output.value?.id,
            layer.value?.view_id,
            layer.value?.revision,
            geometry.value,
          ],
          enabled: geometry.value !== null && output.value !== undefined,
          retry: false,
          queryFn: ({ signal }: { signal: AbortSignal }) => {
            if (geometry.value === null || output.value === undefined)
              throw new Error(copy.noRaster);
            return rasterApi.statistics(
              workspaceId.value,
              output.value.id,
              geometry.value,
              layer.value!.view_id!,
              signal,
            );
          },
        })),
      ),
    );
    watchMounted(
      [
        () => geometry.value,
        () => selection.value,
        () => sessionId.value,
        () => layer.value?.id,
      ],
      () => {
        if (
          geometry.value !== null &&
          selection.value != null &&
          selection.value.layer_id !== (layer.value?.id ?? null)
        )
          useAppUiStore().setMapSelection(sessionId.value, {
            geometry: geometry.value,
            layer_id: layer.value?.id ?? null,
          });
      },
    );
    watchMounted([() => stats.isError, () => stats.error], () => {
      if (stats.isError)
        console.error("[map] Region statistics failed", stats.error);
    });
    return () => {
      const _map = map.value,
        _geometry = geometry.value,
        _sessionId = sessionId.value,
        _layer = layer.value;
      return (
        <>
          <MapToolHint map={_map}>
            {(
              [
                {
                  mode: "rectangle",
                  Icon: SquareDashed,
                  title: copy.rectangle,
                },
                {
                  mode: "polygon",
                  Icon: Pentagon,
                  title: copy.polygon,
                },
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
                  <Icon class="size-3.5" />
                </Button>
              </Tooltip>
            ))}
            <span class="map-tool-divider" />
            <span role="status">
              {drawing.mode === "rectangle"
                ? copy.drawRectangle
                : copy.drawPolygon}
            </span>
            <Tooltip label={copy.import}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={copy.import}
                onClick={() => fileInput.value?.click()}
              >
                <Upload class="size-3.5" />
              </Button>
            </Tooltip>
            <input
              type="file"
              ref={fileInput}
              class="hidden"
              accept=".json,.geojson"
              onInput={(event) => {
                const file = (event.target as HTMLInputElement).files?.[0];
                (event.target as HTMLInputElement).value = "";
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
          {(_geometry !== null || error.value !== null) && (
            <section class="map-inspection" aria-label={copy.region}>
              <div class="flex items-center gap-2 border-b border-border/60 px-3 py-2">
                <SquareDashed class="size-3.5 text-muted-foreground" />
                <span class="flex-1 text-xs font-medium">
                  {copy.selectedRegion}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={copy.clear}
                  onClick={() => {
                    useAppUiStore().setMapSelection(_sessionId, null);
                    setError(null);
                  }}
                >
                  <X class="size-3.5" />
                </Button>
              </div>
              <div class="space-y-2 p-3 text-xs">
                {_layer !== null && (
                  <p
                    class="truncate text-[11px] text-muted-foreground"
                    title={_layer.title}
                  >
                    {_layer.title}
                  </p>
                )}
                {stats.isFetching && (
                  <p
                    class="flex items-center gap-2 text-muted-foreground"
                    role="status"
                  >
                    <LoaderCircle class="size-3 animate-spin" />
                    {copy.calculating}
                  </p>
                )}
                {stats.data !== undefined && (
                  <div class="max-h-44 space-y-2 overflow-y-auto" role="status">
                    <p class="text-xl font-medium tracking-tight tabular-nums">
                      {(stats.data.bands[0]!.region_area_m2 / 1e6).toFixed(3)}{" "}
                      <span class="text-xs font-normal text-muted-foreground">
                        km²
                      </span>
                    </p>
                    {stats.data.bands.map((measurement) => (
                      <div class="space-y-2" key={measurement.band}>
                        <p class="font-medium">
                          {measurement.title}
                          {measurement.unit === null
                            ? ""
                            : ` · ${measurement.unit}`}
                        </p>
                        {measurement.classes.map((value) => (
                          <div
                            key={value.value}
                            class="flex items-center justify-between gap-3"
                          >
                            <span class="flex items-center gap-1.5">
                              <span
                                class="size-2 rounded-full"
                                style={{
                                  background: value.color,
                                }}
                              />
                              {value.label}
                            </span>
                            <span class="tabular-nums">
                              {(value.area_m2 / 1e6).toFixed(3)} km²
                            </span>
                          </div>
                        ))}
                        {measurement.mean !== null &&
                          measurement.classes.length === 0 && (
                            <div class="grid grid-cols-3 gap-2">
                              {[
                                [copy.min, measurement.minimum],
                                [copy.max, measurement.maximum],
                                [copy.mean, measurement.mean],
                              ].map(([label, value]) => (
                                <div key={String(label)}>
                                  <p class="text-[10px] text-muted-foreground">
                                    {label}
                                  </p>
                                  <p class="mt-1 tabular-nums">
                                    {typeof value === "number"
                                      ? Number(value.toPrecision(5))
                                      : copy.noData}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        <p class="text-[11px] text-muted-foreground">
                          {copy.validPixels}{" "}
                          {measurement.valid_pixel_count.toLocaleString()} /{" "}
                          {measurement.selected_pixel_count.toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {(error.value !== null || stats.isError) && (
                  <p role="alert" class="text-destructive">
                    {error.value ?? stats.error?.message}
                  </p>
                )}
                <p class="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                  {copy.attachedHint}
                </p>
              </div>
            </section>
          )}
        </>
      );
    };
  },
  {
    name: "RegionInteraction",
    inheritAttrs: false,
    props: ["workspaceId", "sessionId", "layer", "outputs", "map"],
  },
);
