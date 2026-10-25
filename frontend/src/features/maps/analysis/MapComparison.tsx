import { Map, type ErrorEvent } from "maplibre-gl";
import { useEffect, useRef, useState, type RefObject } from "react";
import { getRuntimeConnection } from "@/api/runtime";
import type { MapLayer } from "@/features/analysis/api";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { interactionCopy as copy } from "@/locales/zh-CN/map-interactions";
import { GripVertical } from "lucide-react";

export interface ComparisonCapture {
  map: Map;
  ratio: number;
  ready: boolean;
  error: string | null;
}

export function MapComparison({
  map,
  layers,
  pair,
  capture,
  onError,
}: {
  readonly map: ReturnType<typeof useSessionMap>;
  readonly layers: readonly MapLayer[];
  readonly pair: readonly [string, string];
  readonly capture: RefObject<ComparisonCapture | null>;
  readonly onError: (message: string) => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(50);
  const [layersReady, setLayersReady] = useState(false);
  const ratioRef = useRef(0.5);
  const dragPointer = useRef<number | null>(null);
  const instance = map.getMap();
  function moveDivider(clientX: number) {
    const bounds = target.current?.getBoundingClientRect();
    if (bounds === undefined || bounds.width === 0) return;
    setRatio(
      Math.min(
        100,
        Math.max(0, ((clientX - bounds.left) / bounds.width) * 100),
      ),
    );
  }
  useEffect(() => {
    if (!map.ready || instance === null) {
      setLayersReady(false);
      return;
    }
    const check = () =>
      setLayersReady(pair.every((id) => instance.getLayer(id) !== undefined));
    instance.on("styledata", check);
    check();
    return () => {
      instance.off("styledata", check);
    };
  }, [instance, map.ready, pair, layers]);
  useEffect(() => {
    if (
      !map.ready ||
      !layersReady ||
      instance === null ||
      target.current === null
    )
      return;
    if (pair.some((id) => instance.getLayer(id) === undefined)) return;
    const style = structuredClone(instance.getStyle());
    for (const layer of style.layers) {
      if (!layers.some((item) => item.id === layer.id)) continue;
      layer.layout = {
        ...layer.layout,
        visibility: layer.id === pair[1] ? "visible" : "none",
      };
      if (layer.type === "raster")
        layer.paint = { ...layer.paint, "raster-opacity": 1 };
    }
    const second = new Map({
      container: target.current,
      style,
      center: instance.getCenter(),
      zoom: instance.getZoom(),
      bearing: instance.getBearing(),
      pitch: instance.getPitch(),
      maxPitch: 85,
      attributionControl: false,
      interactive: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      transformRequest: (url) => {
        const runtime = getRuntimeConnection();
        const parsed = new URL(url, runtime.baseUrl);
        return parsed.origin === new URL(runtime.baseUrl).origin &&
          parsed.pathname.startsWith("/api/")
          ? { url, headers: { "X-Kunyu-Session": runtime.sessionToken } }
          : { url };
      },
    });
    capture.current = {
      map: second,
      ratio: ratioRef.current,
      ready: false,
      error: null,
    };
    for (const layer of layers)
      if (instance.getLayer(layer.id) !== undefined) {
        instance.setLayoutProperty(
          layer.id,
          "visibility",
          layer.id === pair[0] ? "visible" : "none",
        );
        instance.setPaintProperty(layer.id, "raster-opacity", 1);
      }
    const sync = () => {
      second.setPadding(instance.getPadding());
      second.jumpTo({
        center: instance.getCenter(),
        zoom: instance.getZoom(),
        bearing: instance.getBearing(),
        pitch: instance.getPitch(),
      });
    };
    const resize = new ResizeObserver(() => {
      second.resize();
      sync();
    });
    resize.observe(target.current);
    let failed = false;
    const error = (event: ErrorEvent) => {
      failed = true;
      console.error("[map] Comparison failed", event.error);
      if (capture.current !== null) {
        capture.current.ready = false;
        capture.current.error = event.error.message;
      }
      onError(event.error.message);
    };
    const idle = () => {
      if (capture.current?.map === second) capture.current.ready = !failed;
    };
    second.on("error", error);
    second.on("idle", idle);
    instance.on("move", sync);
    sync();
    return () => {
      instance.off("move", sync);
      resize.disconnect();
      capture.current = null;
      second.remove();
      if (instance.getStyle() === undefined) return;
      for (const layer of layers)
        if (instance.getLayer(layer.id) !== undefined) {
          instance.setLayoutProperty(
            layer.id,
            "visibility",
            layer.visible ? "visible" : "none",
          );
          instance.setPaintProperty(layer.id, "raster-opacity", layer.opacity);
        }
    };
  }, [instance, map.ready, layersReady, pair, layers, capture, onError]);
  useEffect(() => {
    ratioRef.current = ratio / 100;
    if (capture.current !== null) capture.current.ratio = ratio / 100;
  }, [ratio, capture]);
  return (
    <>
      <div
        ref={target}
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ clipPath: `inset(0 0 0 ${ratio}%)` }}
      />
      <div className="pointer-events-none absolute inset-x-4 bottom-[calc(var(--map-overlay-height,180px)+3rem)] z-[4] flex justify-between gap-12 text-xs">
        {pair.map((id, index) => {
          const layer = layers.find((item) => item.id === id);
          return (
            <div
              key={id}
              className="max-w-[32%] rounded-lg border border-border bg-background/95 px-3 py-2 shadow-sm"
            >
              <p className="truncate font-medium">
                {index === 0 ? copy.left : copy.right} · {layer?.title}
              </p>
              {layer?.image && (
                <p className="mt-1 text-muted-foreground">
                  {layer.image.product_name} · {layer.image.acquired_at}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={copy.divider}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ratio}
        className="absolute inset-y-0 z-[3] w-6 -translate-x-1/2 cursor-ew-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-white after:shadow focus-visible:after:bg-primary"
        style={{ left: `${ratio}%` }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus();
          dragPointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          moveDivider(event.clientX);
        }}
        onPointerMove={(event) => {
          if (dragPointer.current !== event.pointerId) return;
          event.stopPropagation();
          moveDivider(event.clientX);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          if (dragPointer.current !== event.pointerId) return;
          moveDivider(event.clientX);
          dragPointer.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragPointer.current = null;
        }}
        onLostPointerCapture={() => {
          dragPointer.current = null;
        }}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          const delta = event.shiftKey ? 10 : 1;
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          event.stopPropagation();
          setRatio((current) => {
            if (event.key === "Home") return 0;
            if (event.key === "End") return 100;
            const next = current + (event.key === "ArrowLeft" ? -delta : delta);
            return Math.min(100, Math.max(0, next));
          });
        }}
      >
        <span className="absolute top-1/2 left-1/2 z-[1] flex h-12 w-7 -translate-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md">
          <GripVertical className="size-4" aria-hidden="true" />
        </span>
      </div>
    </>
  );
}
