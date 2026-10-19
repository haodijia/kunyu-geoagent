import { analysisApi, analysisKeys, type MapLayer, type MapState } from "@/features/analysis/api";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

export function useMapPresentation(map: ReturnType<typeof useSessionMap>, state: MapState, layers: readonly MapLayer[], layerFailed: boolean) {
  const client = useQueryClient();
  const instance = map.getMap();
  const request = state.presentation;
  const processed = useRef<string | null>(null);
  const positioned = useRef<string | null>(null);
  const lastInteraction = useRef(0);
  const [revision, setRevision] = useState(0);
  const [pendingFocus, setPendingFocus] = useState(false);
  const [receiptError, setReceiptError] = useState(false);
  useEffect(() => {
    processed.current = null;
    positioned.current = null;
  }, [instance, map.ready]);
  useEffect(() => {
    if (!map.ready || instance === null) return;
    const interact = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent !== undefined) lastInteraction.current = Date.now();
    };
    const idle = () => setRevision(value => value + 1);
    instance.on("dragstart", interact);
    instance.on("zoomstart", interact);
    instance.on("idle", idle);
    return () => { instance.off("dragstart", interact); instance.off("zoomstart", interact); instance.off("idle", idle); };
  }, [instance, map.ready]);
  const focus = () => {
    if (request?.bounds === null || request === null) return;
    const [west, south, east, north] = request.bounds;
    map.focusBounds([[west, south], [east, north]]);
    setPendingFocus(false);
  };
  useEffect(() => {
    if (request === null || request.status === "applied") return;
    const failed = map.failed || layerFailed;
    const key = `${request.request_id}:${failed}`;
    if (processed.current === key) return;
    if (!failed) {
      if (!map.ready || instance === null || !instance.areTilesLoaded()) return;
      const presented = layers.filter(layer => request.target === "output"
        ? layer.output_id === request.reference_id : layer.image?.candidate_set_id === request.reference_id);
      if (presented.length === 0 || presented.some(layer => layer.visible && (instance.getLayer(layer.id) === undefined || !instance.isSourceLoaded(layer.id)))) return;
      if (request.focus && request.bounds !== null && positioned.current !== request.request_id) {
        positioned.current = request.request_id;
        if (instance.isMoving() || Date.now() - lastInteraction.current < 3000 || document.activeElement?.matches("textarea, input, [contenteditable=true]")) setPendingFocus(true);
        else focus();
      }
      if (instance.isMoving() || !instance.areTilesLoaded()) return;
    }
    processed.current = key;
    setReceiptError(false);
    void analysisApi.receipt(state.session_id, request.request_id, failed ? "failed" : "applied", failed ? "Map layers could not be rendered." : null).then(value => {
      client.setQueryData<MapState>(analysisKeys.map(state.session_id), current => current === undefined || current.revision < value.revision ? value : current);
    }).catch(error => {
      console.error("[map] Presentation receipt failed.", error);
      processed.current = null;
      setReceiptError(true);
    });
  }, [instance, map.ready, map.failed, request, layers, layerFailed, state.session_id, client, revision]);
  return { pendingFocus, focus, receiptError, retryReceipt: () => { processed.current = null; setRevision(value => value + 1); } };
}
