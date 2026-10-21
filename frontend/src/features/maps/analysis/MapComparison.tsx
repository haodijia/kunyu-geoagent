import { Map, type ErrorEvent } from "maplibre-gl";
import { useEffect, useRef, useState, type RefObject } from "react";
import { getRuntimeConnection } from "@/api/runtime";
import type { MapLayer } from "@/features/analysis/api";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { interactionCopy as copy } from "@/locales/zh-CN/map-interactions";

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
  const ratioRef = useRef(0.5);
  const instance = map.getMap();
  useEffect(() => {
    if (!map.ready || instance === null || target.current === null) return;
    if (pair.some((id) => instance.getLayer(id) === undefined)) {
      onError(copy.failedRequest);
      return;
    }
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
  }, [instance, map.ready, pair, layers, capture, onError]);
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
      <div
        className="pointer-events-none absolute inset-y-0 z-[2] w-px bg-white shadow"
        style={{ left: `${ratio}%` }}
      />
      <input
        aria-label={copy.divider}
        type="range"
        min={0}
        max={100}
        value={ratio}
        onChange={(event) => setRatio(Number(event.target.value))}
        className="absolute bottom-[calc(var(--map-overlay-height,180px)+1rem)] left-1/4 z-10 w-1/2 accent-primary"
      />
    </>
  );
}
