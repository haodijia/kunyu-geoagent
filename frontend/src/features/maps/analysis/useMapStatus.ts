import { useEffect, useRef, useState, type RefObject } from "react";
import { requestJson } from "@/api/client";
import type { MapLayer } from "@/features/analysis/api";
import type { ComparisonCapture } from "@/features/maps/analysis/MapComparison";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { zhCN } from "@/locales/zh-CN";

export interface LayerStatus {
  readonly layer_id: string;
  readonly revision: number;
  readonly state: "hidden" | "loading" | "ready" | "failed";
  readonly error: string | null;
}
interface RenderStatus {
  readonly state: "closed" | "loading" | "ready" | "failed";
  readonly layers: readonly LayerStatus[];
  readonly error: string | null;
}
export function useMapStatus(
  sessionId: string,
  map: ReturnType<typeof useSessionMap>,
  layers: readonly MapLayer[],
  errors: Readonly<Record<string, string>>,
  comparison: RefObject<ComparisonCapture | null>,
  comparisonPair: readonly [string, string] | null,
) {
  const [status, setStatus] = useState<RenderStatus>({
    state: "loading",
    layers: [],
    error: null,
  });
  const refresh = useRef<(() => void) | null>(null);
  const latest = useRef({ map, layers, errors, comparisonPair });
  latest.current = { map, layers, errors, comparisonPair };
  useEffect(() => {
    const instance = latest.current.map.getMap();
    if (instance === null) return;
    const clientId = crypto.randomUUID();
    let active = true;
    let inFlight = false;
    let queued = false;
    const path = `/api/v1/sessions/${encodeURIComponent(sessionId)}/map/clients/${clientId}/status`;
    const report = async () => {
      if (!active) return;
      if (inFlight) {
        queued = true;
        return;
      }
      const current = latest.current;
      const values: LayerStatus[] = current.layers.map((layer) => {
        const error = current.errors[layer.id] ?? null;
        return {
          layer_id: layer.id,
          revision: layer.revision,
          error,
          state: !layer.visible && !current.comparisonPair?.includes(layer.id)
            ? "hidden"
            : error !== null || current.map.failed
              ? "failed"
              : !current.map.ready ||
                  instance.getLayer(layer.id) === undefined ||
                  !instance.isSourceLoaded(layer.id)
                ? "loading"
                : "ready",
        };
      });
      const failed =
        current.map.failed ||
        comparison.current?.error != null ||
        values.some((value) => value.state === "failed");
      const loading =
        !current.map.ready ||
        !instance.loaded() ||
        instance.isMoving() ||
        values.some((value) => value.state === "loading") ||
        (current.comparisonPair !== null && comparison.current === null) ||
        (comparison.current !== null && !comparison.current.ready);
      const next: RenderStatus = {
        state: failed ? "failed" : loading ? "loading" : "ready",
        layers: values,
        error: failed
          ? (comparison.current?.error ?? zhCN.map.loadFailed)
          : null,
      };
      setStatus((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      inFlight = true;
      try {
        await requestJson(path, { method: "PUT", body: JSON.stringify(next) });
      } catch (error) {
        if (active)
          console.error("[map] Reporting render status failed", {
            sessionId,
            error,
          });
      } finally {
        inFlight = false;
        if (!active)
          void requestJson(path, {
            method: "PUT",
            body: JSON.stringify({ state: "closed", layers: [], error: null }),
          }).catch((error) =>
            console.error("[map] Closing render status failed", error),
          );
        else if (queued) {
          queued = false;
          void report();
        }
      }
    };
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(scheduled);
      scheduled = setTimeout(() => {
        void report();
      }, 100);
    };
    refresh.current = update;
    instance.on("idle", update);
    instance.on("error", update);
    instance.on("dataloading", update);
    const timer = setInterval(update, 10_000);
    update();
    return () => {
      active = false;
      refresh.current = null;
      clearTimeout(scheduled);
      clearInterval(timer);
      instance.off("idle", update);
      instance.off("error", update);
      instance.off("dataloading", update);
      if (!inFlight)
        void requestJson(path, {
          method: "PUT",
          body: JSON.stringify({ state: "closed", layers: [], error: null }),
        }).catch((error) =>
          console.error("[map] Closing render status failed", error),
        );
    };
  }, [sessionId, map.ready, comparison]);
  useEffect(() => {
    refresh.current?.();
  }, [map.ready, map.failed, layers, errors, comparisonPair]);
  return status;
}
