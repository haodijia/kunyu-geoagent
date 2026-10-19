import { useAppUiStore } from "@/app/store";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { useEffect } from "react";

/** Consume a local focus request once the map exists, including after navigation. */
export function useMapFocus(sessionId: string, map: ReturnType<typeof useSessionMap>) {
  const bounds = useAppUiStore(state => state.mapFocusBySession[sessionId]);
  useEffect(() => {
    if (!map.ready || bounds === undefined) return;
    map.focusBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]]);
    useAppUiStore.getState().clearMapFocus(sessionId);
  }, [sessionId, map, bounds]);
}
