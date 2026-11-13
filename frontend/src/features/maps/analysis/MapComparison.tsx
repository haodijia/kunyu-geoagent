import { resolveResourceUrl } from "@/api/runtime";
import type { MapLayer } from "@/features/analysis/api";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { interactionCopy as copy } from "@/locales/zh-CN/map-interactions";
import { GripVertical } from "lucide-vue-next";
import { Map, type ErrorEvent } from "maplibre-gl";
import { computed, defineComponent, shallowRef, type ShallowRef } from "vue";
export interface ComparisonCapture {
  map: Map;
  ratio: number;
  ready: boolean;
  error: string | null;
}
export const MapComparison = defineComponent(
  (
    componentProps: {
      readonly map: ReturnType<typeof useSessionMap>;
      readonly layers: readonly MapLayer[];
      readonly pair: readonly [string, string];
      readonly capture: ShallowRef<ComparisonCapture | null>;
      readonly onError: (message: string) => void;
    },
    { slots: _slots },
  ) => {
    const map = computed(() => componentProps.map),
      layers = computed(() => componentProps.layers),
      pair = computed(() => componentProps.pair),
      capture = computed(() => componentProps.capture),
      onError = computed(() => componentProps.onError);
    const target = shallowRef<HTMLDivElement | null>(null);
    const ratio = shallowRef(50),
      setRatio = refSetter(ratio);
    const layersReady = shallowRef(false),
      setLayersReady = refSetter(layersReady);
    const ratioRef = shallowRef(0.5);
    const dragPointer = shallowRef<number | null>(null);
    const instance = computed(() => map.value.getMap());
    function moveDivider(clientX: number) {
      const bounds = target.value?.getBoundingClientRect();
      if (bounds === undefined || bounds.width === 0) return;
      setRatio(
        Math.min(
          100,
          Math.max(0, ((clientX - bounds.left) / bounds.width) * 100),
        ),
      );
    }
    watchMounted(
      [
        () => instance.value,
        () => map.value.ready,
        () => pair.value,
        () => layers.value,
      ],
      () => {
        const activeMap = instance.value;
        if (!map.value.ready || activeMap === null) {
          setLayersReady(false);
          return;
        }
        const check = () =>
          setLayersReady(
            pair.value.every((id) => activeMap.getLayer(id) !== undefined),
          );
        activeMap.on("styledata", check);
        check();
        return () => {
          const _instance = activeMap;
          _instance.off("styledata", check);
        };
      },
    );
    watchMounted(
      [
        () => instance.value,
        () => map.value.ready,
        () => layersReady.value,
        () => pair.value,
        () => layers.value,
        () => capture.value,
        () => onError.value,
      ],
      () => {
        const activeMap = instance.value;
        if (
          !map.value.ready ||
          !layersReady.value ||
          activeMap === null ||
          target.value === null
        )
          return;
        if (pair.value.some((id) => activeMap.getLayer(id) === undefined))
          return;
        const style = structuredClone(activeMap.getStyle());
        for (const layer of style.layers) {
          if (!layers.value.some((item) => item.id === layer.id)) continue;
          layer.layout = {
            ...layer.layout,
            visibility: layer.id === pair.value[1] ? "visible" : "none",
          };
          if (layer.type === "raster")
            layer.paint = {
              ...layer.paint,
              "raster-opacity": 1,
            };
        }
        const second = new Map({
          container: target.value,
          style,
          center: activeMap.getCenter(),
          zoom: activeMap.getZoom(),
          bearing: activeMap.getBearing(),
          pitch: activeMap.getPitch(),
          maxPitch: 85,
          attributionControl: false,
          interactive: false,
          canvasContextAttributes: {
            preserveDrawingBuffer: true,
          },
          transformRequest: (url) => {
            return { url: resolveResourceUrl(url), credentials: "same-origin" };
          },
        });
        capture.value.value = {
          map: second,
          ratio: ratioRef.value,
          ready: false,
          error: null,
        };
        for (const layer of layers.value)
          if (activeMap.getLayer(layer.id) !== undefined) {
            activeMap.setLayoutProperty(
              layer.id,
              "visibility",
              layer.id === pair.value[0] ? "visible" : "none",
            );
            activeMap.setPaintProperty(layer.id, "raster-opacity", 1);
          }
        const sync = () => {
          second.setPadding(activeMap.getPadding());
          second.jumpTo({
            center: activeMap.getCenter(),
            zoom: activeMap.getZoom(),
            bearing: activeMap.getBearing(),
            pitch: activeMap.getPitch(),
          });
        };
        const resize = new ResizeObserver(() => {
          second.resize();
          sync();
        });
        resize.observe(target.value);
        let failed = false;
        const error = (event: ErrorEvent) => {
          failed = true;
          console.error("[map] Comparison failed", event.error);
          if (capture.value.value !== null) {
            capture.value.value.ready = false;
            capture.value.value.error = event.error.message;
          }
          onError.value(event.error.message);
        };
        const idle = () => {
          if (capture.value.value?.map === second)
            capture.value.value.ready = !failed;
        };
        second.on("error", error);
        second.on("idle", idle);
        activeMap.on("move", sync);
        sync();
        return () => {
          const _instance2 = activeMap,
            _capture = capture.value,
            _layers = layers.value;
          _instance2.off("move", sync);
          resize.disconnect();
          _capture.value = null;
          second.remove();
          if (_instance2.getStyle() === undefined) return;
          for (const layer of _layers)
            if (_instance2.getLayer(layer.id) !== undefined) {
              _instance2.setLayoutProperty(
                layer.id,
                "visibility",
                layer.visible ? "visible" : "none",
              );
              _instance2.setPaintProperty(
                layer.id,
                "raster-opacity",
                layer.opacity,
              );
            }
        };
      },
    );
    watchMounted([() => ratio.value, () => capture.value], () => {
      ratioRef.value = ratio.value / 100;
      if (capture.value.value !== null)
        capture.value.value.ratio = ratio.value / 100;
    });
    return () => {
      const _pair = pair.value,
        _layers2 = layers.value;
      return (
        <>
          <div
            ref={target}
            class="pointer-events-none absolute inset-0 z-[1]"
            style={{
              clipPath: `inset(0 0 0 ${ratio.value}%)`,
            }}
          />
          <div class="pointer-events-none absolute inset-x-4 bottom-[calc(var(--map-overlay-height,180px)+3rem)] z-[4] flex justify-between gap-12 text-xs">
            {_pair.map((id, index) => {
              const layer = _layers2.find((item) => item.id === id);
              return (
                <div
                  key={id}
                  class="max-w-[32%] rounded-lg border border-border bg-background/95 px-3 py-2 shadow-sm"
                >
                  <p class="truncate font-medium">
                    {index === 0 ? copy.left : copy.right} · {layer?.title}
                  </p>
                  {layer?.image && (
                    <p class="mt-1 text-muted-foreground">
                      {layer.image.product_name} · {layer.image.acquired_at}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div
            role="slider"
            tabindex={0}
            aria-label={copy.divider}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ratio.value}
            class="absolute inset-y-0 z-[3] w-6 -translate-x-1/2 cursor-ew-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-white after:shadow focus-visible:after:bg-primary"
            style={{
              left: `${ratio.value}%`,
            }}
            onPointerdown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              (event.currentTarget as HTMLElement).focus();
              dragPointer.value = event.pointerId;
              (event.currentTarget as HTMLElement).setPointerCapture(
                event.pointerId,
              );
              moveDivider(event.clientX);
            }}
            onPointermove={(event) => {
              if (dragPointer.value !== event.pointerId) return;
              event.stopPropagation();
              moveDivider(event.clientX);
            }}
            onPointerup={(event) => {
              event.stopPropagation();
              if (dragPointer.value !== event.pointerId) return;
              moveDivider(event.clientX);
              dragPointer.value = null;
              if (
                (event.currentTarget as HTMLElement).hasPointerCapture(
                  event.pointerId,
                )
              )
                (event.currentTarget as HTMLElement).releasePointerCapture(
                  event.pointerId,
                );
            }}
            onPointercancel={() => {
              dragPointer.value = null;
            }}
            onLostpointercapture={() => {
              dragPointer.value = null;
            }}
            onClick={(event) => event.stopPropagation()}
            onKeydown={(event) => {
              const delta = event.shiftKey ? 10 : 1;
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              setRatio((current) => {
                if (event.key === "Home") return 0;
                if (event.key === "End") return 100;
                const next =
                  current + (event.key === "ArrowLeft" ? -delta : delta);
                return Math.min(100, Math.max(0, next));
              });
            }}
          >
            <span class="absolute top-1/2 left-1/2 z-[1] flex h-12 w-7 -translate-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md">
              <GripVertical class="size-4" aria-hidden="true" />
            </span>
          </div>
        </>
      );
    };
  },
  {
    name: "MapComparison",
    inheritAttrs: false,
    props: ["map", "layers", "pair", "capture", "onError"],
  },
);
