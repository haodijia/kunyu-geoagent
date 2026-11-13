import { useAppUiStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import type { AnalysisOutput, MapLayer } from "@/features/analysis/api";
import { rasterApi } from "@/features/analysis/raster";
import { MapToolHint } from "@/features/maps/analysis/MapToolHint";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { watchMounted } from "@/lib/lifecycle";
import { interactionCopy as copy } from "@/locales/zh-CN/map-interactions";
import { useQuery } from "@tanstack/vue-query";
import { Crosshair, LoaderCircle, X } from "lucide-vue-next";
import type { MapMouseEvent } from "maplibre-gl";
import { computed, defineComponent, reactive } from "vue";
export interface InteractionProps {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly layer: MapLayer | null;
  readonly outputs: readonly AnalysisOutput[];
  readonly map: ReturnType<typeof useSessionMap>;
}
export const PixelInteraction = defineComponent(
  (componentProps: InteractionProps, { slots: _slots }) => {
    const workspaceId = computed(() => componentProps.workspaceId),
      sessionId = computed(() => componentProps.sessionId),
      layer = computed(() => componentProps.layer),
      map = computed(() => componentProps.map);
    const selection = computed(() =>
      ((state) => state.mapContextBySession[sessionId.value]?.selection)(
        useAppUiStore(),
      ),
    );
    const point = computed(() =>
      selection.value?.geometry.type === "Point"
        ? selection.value.geometry.coordinates
        : null,
    );
    const outputId = computed(() => layer.value?.output_id ?? null);
    const layerId = computed(() => layer.value?.id ?? null);
    const instance = computed(() => map.value.getMap());
    const query = reactive(
      useQuery(
        computed(() => ({
          queryKey: [
            "map-pixel",
            workspaceId.value,
            outputId.value,
            layer.value?.view_id,
            layer.value?.revision,
            point.value,
          ],
          enabled: point.value !== null && outputId.value !== null,
          retry: false,
          queryFn: ({ signal }: { signal: AbortSignal }) => {
            if (point.value === null || outputId.value === null)
              throw new Error(copy.noRaster);
            return rasterApi.sample(
              workspaceId.value,
              outputId.value,
              point.value[0]!,
              point.value[1]!,
              signal,
              layer.value!.view_id!,
            );
          },
        })),
      ),
    );
    const sample = computed(() => query.data ?? null);
    const error = computed(() => query.error?.message ?? null);
    watchMounted([() => query.isError, () => query.error], () => {
      if (query.isError) console.error("[map] Pixel query failed", query.error);
    });
    watchMounted(
      [() => selection.value, () => layerId.value, () => sessionId.value],
      () => {
        if (
          selection.value?.geometry.type === "Point" &&
          selection.value.layer_id !== layerId.value
        )
          useAppUiStore().setMapSelection(sessionId.value, {
            geometry: selection.value.geometry,
            layer_id: layerId.value,
          });
      },
    );
    watchMounted(
      [
        () => instance.value,
        () => map.value.ready,
        () => outputId.value,
        () => sessionId.value,
        () => layerId.value,
      ],
      () => {
        const activeMap = instance.value;
        if (activeMap === null || !map.value.ready || outputId.value === null)
          return;
        const click = (event: MapMouseEvent) => {
          const coordinates: [number, number] = [
            event.lngLat.wrap().lng,
            event.lngLat.lat,
          ];
          useAppUiStore().setMapSelection(sessionId.value, {
            geometry: {
              type: "Point",
              coordinates,
            },
            layer_id: layerId.value,
          });
        };
        activeMap.on("click", click);
        return () => {
          const _instance = activeMap;
          _instance.off("click", click);
        };
      },
    );
    return () => {
      const _map = map.value,
        _outputId = outputId.value,
        _layer = layer.value,
        _point = point.value,
        _selection = selection.value,
        _sessionId = sessionId.value,
        _sample = sample.value,
        _error = error.value;
      return (
        <>
          <MapToolHint map={_map}>
            <Crosshair class="size-3.5 shrink-0" />
            <span>{_outputId === null ? copy.noRaster : copy.pixelHint}</span>
            {_layer !== null && (
              <span class="map-tool-target" title={_layer.title}>
                {_layer.title}
              </span>
            )}
          </MapToolHint>
          {_point !== null && _selection?.geometry.type === "Point" && (
            <section class="map-inspection" aria-label={copy.pixel}>
              <div class="flex items-center gap-2 border-b border-border/60 px-3 py-2">
                <Crosshair class="size-3.5 text-muted-foreground" />
                <span class="min-w-0 flex-1 truncate text-xs font-medium">
                  {_layer?.title}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={copy.clear}
                  onClick={() => {
                    useAppUiStore().setMapSelection(_sessionId, null);
                  }}
                >
                  <X class="size-3.5" />
                </Button>
              </div>
              <div class="space-y-2 p-3 text-xs">
                <p class="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {_point[0]!.toFixed(5)}°, {_point[1]!.toFixed(5)}°
                </p>
                {_sample !== null && (
                  <div
                    class="max-h-40 space-y-1.5 overflow-y-auto"
                    role="status"
                  >
                    {!_sample.inside ? (
                      <p>{copy.outside}</p>
                    ) : (
                      _sample.values.map((value, index) => {
                        const category = _sample.categories?.find(
                          (entry) => entry.value === value,
                        );
                        return (
                          <div
                            key={index}
                            class="flex items-center justify-between gap-3"
                          >
                            <span class="truncate text-muted-foreground">
                              {_sample.bands[index] ?? copy.band(index + 1)}
                              {_sample.units[index] == null
                                ? ""
                                : ` · ${_sample.units[index]}`}
                            </span>
                            <span class="flex shrink-0 items-center gap-1.5 font-medium tabular-nums">
                              {category !== undefined && (
                                <span
                                  class="size-2 rounded-full"
                                  style={{
                                    background: category.color,
                                  }}
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
                {_outputId === null && <p>{copy.noRaster}</p>}
                {_outputId !== null && _sample === null && _error === null && (
                  <p
                    role="status"
                    class="flex items-center gap-2 text-muted-foreground"
                  >
                    <LoaderCircle class="size-3 animate-spin" />
                    {copy.loading}
                  </p>
                )}
                {_error !== null && (
                  <p role="alert" class="text-destructive">
                    {_error}
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
    name: "PixelInteraction",
    inheritAttrs: false,
    props: ["workspaceId", "sessionId", "layer", "map"],
  },
);
