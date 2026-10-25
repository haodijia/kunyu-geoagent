import { AlertCircle, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import "@/features/maps/map.css";
import "maplibre-gl/dist/maplibre-gl.css";

import { Button } from "@/components/ui/button";
import { AgentControls } from "@/features/agent/controls/AgentControls";
import { MapToolbar } from "@/features/maps/MapToolbar";
import { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { SessionComposer } from "@/features/messages/composer/SessionComposer";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";

import { AnalysisPanel } from "@/features/analysis/AnalysisPanel";
import { analysisApi, analysisKeys } from "@/features/analysis/api";
import { useQuery } from "@tanstack/react-query";
import { MapConversation } from "@/features/maps/conversation/MapConversation";
import { MapLayers } from "@/features/maps/layers/MapLayers";
import { useMapFocus } from "@/features/maps/runtime/useMapFocus";
import {
  MapCaptureError,
  registerMapCapture,
} from "@/features/maps/runtime/map-capture";
import {
  MapInteractions,
  type MapInteraction,
} from "@/features/maps/analysis/MapInteractions";
import { MapComparison } from "@/features/maps/analysis/MapComparison";
import { useMapStatus } from "@/features/maps/analysis/useMapStatus";
import type { ComparisonCapture } from "@/features/maps/analysis/MapComparison";
import { captureComparedMap } from "@/features/maps/analysis/comparison-capture";
import { useAppUiStore } from "@/app/store";
import { useSelectionOverlay } from "@/features/maps/analysis/useMapDrawing";

const content = zhCN.map;

export function MapView() {
  const session = useSessionWorkspace();
  return <MapCanvas key={session.id} />;
}
function MapCanvas() {
  const targetRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const session = useSessionWorkspace();
  const map = useSessionMap(
    targetRef,
    overlayRef,
    session.id,
    session.workspace_id,
  );
  const [interaction, setInteraction] = useState<MapInteraction | null>(null);
  const pair = useAppUiStore(
    (state) => state.mapComparisonBySession[session.id] ?? null,
  );
  const selectedLayerId = useAppUiStore(
    (state) => state.mapExpandedLayerBySession[session.id],
  );
  const selection = useAppUiStore(
    (state) => state.mapContextBySession[session.id]?.selection,
  );
  useSelectionOverlay(map.getMap(), map.ready, selection?.geometry ?? null);
  const setPair = useCallback(
    (value: readonly [string, string] | null) => {
      useAppUiStore.getState().setMapComparison(session.id, value);
    },
    [session.id],
  );
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const comparisonCapture = useRef<ComparisonCapture | null>(null);
  useMapFocus(session.id, map);
  const layerQuery = useQuery({
    queryKey: analysisKeys.layers(session.id),
    queryFn: () => analysisApi.layers(session.id),
  });
  const layers = layerQuery.data ?? [];
  const outputs = useQuery({
    queryKey: analysisKeys.outputs(session.workspace_id),
    queryFn: () => analysisApi.outputs(session.workspace_id),
  });
  useEffect(() => {
    if (
      pair !== null &&
      !layerQuery.isPending &&
      pair.some(
        (id) =>
          !layers.some((layer) => layer.id === id && layer.bounds !== null),
      )
    )
      setPair(null);
    if (
      interaction !== null &&
      interaction.layerId !== null &&
      !layerQuery.isPending &&
      !layers.some((layer) => layer.id === interaction.layerId)
    )
      setInteraction({ ...interaction, layerId: null });
  }, [layers, pair, interaction, setPair, layerQuery.isPending]);
  useEffect(() => {
    if (pair !== null && layers.some((layer) => layer.id === pair[0]))
      setInteraction({ layerId: pair[0], mode: "compare" });
  }, [pair, layers]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("input, textarea, [contenteditable=true]")
        )
      ) {
        useAppUiStore.getState().setMapSelection(session.id, null);
        setInteraction(null);
        setPair(null);
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [interaction, setPair, session.id]);
  const spatialLayers = layers
    .filter((layer) => layer.bounds !== null)
    .sort((a, b) => b.position - a.position);
  const selectedLayer = spatialLayers.find(
    (layer) => layer.id === selectedLayerId,
  );
  const targetLayer =
    selectedLayer ?? spatialLayers.find((layer) => layer.visible);
  const activeInteraction: MapInteraction | null =
    interaction === null
      ? null
      : { ...interaction, layerId: targetLayer?.id ?? null };
  function toggleInteraction(mode: MapInteraction["mode"]) {
    setComparisonError(null);
    setPair(null);
    useAppUiStore.getState().setMapSelection(session.id, null);
    if (interaction?.mode === mode) {
      setInteraction(null);
      return;
    }
    if (mode === "compare") {
      const visible = spatialLayers.filter((layer) => layer.visible);
      if (visible.length >= 2) {
        setPair([visible[1]!.id, visible[0]!.id]);
        setInteraction({ layerId: visible[0]!.id, mode });
        return;
      }
    }
    const eligible = spatialLayers.filter(
      (layer) => mode !== "pixel" || layer.output_id !== null,
    );
    const layer =
      eligible.find((layer) => layer.id === selectedLayerId) ?? eligible[0];
    setInteraction({ layerId: layer?.id ?? null, mode });
  }
  useEffect(
    () =>
      registerMapCapture(session.id, async () => {
        const instance = map.getMap();
        if (
          instance === null ||
          !map.ready ||
          map.failed ||
          layerQuery.isPending ||
          layerQuery.isError ||
          (pair !== null && comparisonCapture.current === null) ||
          layers.some(
            (layer) =>
              layer.visible && instance.getLayer(layer.id) === undefined,
          )
        ) {
          throw new MapCaptureError("MAP_NOT_READY", content.captureNotReady);
        }
        return captureComparedMap(instance, comparisonCapture.current);
      }),
    [session.id, map, layerQuery.isPending, layerQuery.isError, layers, pair],
  );
  const [layerErrors, setLayerErrors] = useState<
    Readonly<Record<string, string>>
  >({});
  const layerError = useCallback((id: string, error: string | null) => {
    setLayerErrors((current) => {
      if (
        current[id] === error ||
        (current[id] === undefined && error === null)
      )
        return current;
      const next = { ...current };
      if (error === null) delete next[id];
      else next[id] = error;
      return next;
    });
  }, []);

  const rendering = useMapStatus(
    session.id,
    map,
    layers,
    layerErrors,
    comparisonCapture,
    pair,
  );
  const interactionContent = activeInteraction !== null && (
    <MapInteractions
      value={activeInteraction}
      map={map}
      workspaceId={session.workspace_id}
      sessionId={session.id}
      layers={layers}
      outputs={outputs.data ?? []}
      pair={pair}
      onPair={(value) => {
        setComparisonError(null);
        setPair(value);
      }}
      onClose={() => {
        setInteraction(null);
        setPair(null);
        useAppUiStore.getState().setMapSelection(session.id, null);
      }}
    />
  );
  return (
    <div
      className="kunyu-map chat-surface-container relative h-full overflow-hidden bg-muted"
      aria-label={content.label}
    >
      <div ref={targetRef} className="absolute inset-0" />
      <MapToolbar
        map={map}
        mode={activeInteraction?.mode ?? null}
        onInteract={toggleInteraction}
        onFitLayers={() => {
          const bounds = spatialLayers
            .filter((layer) => layer.visible)
            .map((layer) => layer.bounds!);
          if (bounds.length > 0)
            map.focusBounds([
              Math.min(...bounds.map((b) => b[0])),
              Math.min(...bounds.map((b) => b[1])),
              Math.max(...bounds.map((b) => b[2])),
              Math.max(...bounds.map((b) => b[3])),
            ]);
        }}
        hasLayers={spatialLayers.some((layer) => layer.visible)}
      />
      <MapLayers
        map={map}
        workspaceId={session.workspace_id}
        layers={layers}
        comparison={pair}
        onError={layerError}
      />
      <div className="map-analysis-dock pointer-events-none absolute top-4 left-4 z-20 flex w-64 max-w-[calc(100%-8rem)] flex-col gap-2 [&>*]:pointer-events-auto">
        <AnalysisPanel
          sessionId={session.id}
          layers={layers}
          error={
            layerQuery.isError ||
            outputs.isError ||
            Object.keys(layerErrors).length > 0
          }
          statuses={rendering.layers}
        />
        {interactionContent}
        {comparisonError !== null && (
          <div
            role="alert"
            className="rounded-lg border border-border bg-background p-3 text-xs text-destructive"
          >
            {comparisonError}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPair(null);
                setComparisonError(null);
              }}
            >
              {content.closeComparison}
            </Button>
          </div>
        )}
      </div>
      {pair !== null && (
        <MapComparison
          map={map}
          layers={layers}
          pair={pair}
          capture={comparisonCapture}
          onError={setComparisonError}
        />
      )}
      <div className="pointer-events-none absolute right-4 bottom-[calc(var(--map-overlay-height,180px)+3rem)] z-10 max-w-80 [&>*]:pointer-events-auto">
        {map.failed ? (
          <div
            className="rounded-xl border border-border bg-background/95 p-4 shadow-sm backdrop-blur"
            role="alert"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertCircle
                className="size-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              {content.loadFailed}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {content.loadFailedDescription}
            </p>
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={map.reload}
            >
              {content.retry}
            </Button>
          </div>
        ) : map.loading ? (
          <div
            className="flex items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs text-secondary-foreground shadow-sm"
            role="status"
          >
            <LoaderCircle
              className="size-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            {content.loading}
          </div>
        ) : map.dimension === "3d" ? (
          <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm">
            {content.terrainHint}
          </div>
        ) : null}
      </div>
      <div
        ref={overlayRef}
        className="map-composer-overlay pointer-events-none absolute z-10 [&>*]:pointer-events-auto"
      >
        <MapConversation />
        <AgentControls />
        <SessionComposer />
      </div>
    </div>
  );
}
