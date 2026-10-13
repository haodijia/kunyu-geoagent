import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  analysisApi,
  analysisKeys,
  type MapState,
} from "@/features/analysis/api";
import type { MapCamera, MapViewport } from "@/features/sessions/map-context";

type View = {
  viewport: MapViewport;
  camera: MapCamera;
  appliedFocusRevision: number;
};
export function usePersistentMap(sessionId: string) {
  const client = useQueryClient();
  const state = useQuery({
    queryKey: analysisKeys.map(sessionId),
    queryFn: () => analysisApi.map(sessionId),
  });
  const layers = useQuery({
    queryKey: analysisKeys.layers(sessionId),
    queryFn: () => analysisApi.layers(sessionId),
  });
  const [saveFailed, setSaveFailed] = useState(false);
  const pending = useRef<View | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const flush = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      while (pending.current !== null) {
        const view = pending.current;
        pending.current = null;
        const current = client.getQueryData<MapState>(
          analysisKeys.map(sessionId),
        );
        if (current === undefined)
          throw new Error("Map state is required before saving its view.");
        const next = await analysisApi.saveView(
          sessionId,
          current.revision,
          view.viewport,
          view.camera,
          view.appliedFocusRevision,
        );
        // A map action arriving during the request owns the newer revision.
        const latest = client.getQueryData<MapState>(
          analysisKeys.map(sessionId),
        );
        if (latest === undefined || next.revision >= latest.revision)
          client.setQueryData(analysisKeys.map(sessionId), next);
        setSaveFailed(false);
      }
    } catch (error) {
      pending.current = null;
      console.error("[map] Persisting the camera failed.", {
        sessionId,
        error,
      });
      setSaveFailed(true);
      await client.invalidateQueries({ queryKey: analysisKeys.map(sessionId) });
    } finally {
      saving.current = false;
    }
  }, [client, sessionId]);
  const save = useCallback(
    (
      viewport: MapViewport,
      camera: MapCamera,
      appliedFocusRevision: number,
    ) => {
      pending.current = { viewport, camera, appliedFocusRevision };
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 250);
    },
    [flush],
  );
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      void flush();
    },
    [flush],
  );
  return { state, layers, save, saveFailed };
}
