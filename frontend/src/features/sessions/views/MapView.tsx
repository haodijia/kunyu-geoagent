import { AlertCircle, LoaderCircle } from "lucide-react";
import { useCallback, useRef, useState } from "react";

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
import type { MapState } from "@/features/analysis/api";
import { MapConversation } from "@/features/maps/conversation/MapConversation";
import { MapLayers } from "@/features/maps/layers/MapLayers";
import { useMapPresentation } from "@/features/maps/layers/useMapPresentation";
import { usePersistentMap } from "@/features/maps/runtime/usePersistentMap";

const content = zhCN.map;

export function MapView() {
  const session = useSessionWorkspace();
  const persistent = usePersistentMap(session.id);
  if (persistent.state.isError)
    return (
      <div
        className="flex h-full items-center justify-center gap-3 text-sm text-destructive"
        role="alert"
      >
        {zhCN.analysis.loadFailed}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void persistent.state.refetch()}
        >
          {content.retry}
        </Button>
      </div>
    );
  if (persistent.state.data === undefined)
    return (
      <div
        className="flex h-full items-center justify-center text-sm text-muted-foreground"
        role="status"
      >
        {zhCN.analysis.loading}
      </div>
    );
  return (
    <MapCanvas
      key={session.id}
      state={persistent.state.data}
      persistent={persistent}
    />
  );
}
function MapCanvas({
  state,
  persistent,
}: {
  readonly state: MapState;
  readonly persistent: ReturnType<typeof usePersistentMap>;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const session = useSessionWorkspace();
  const map = useSessionMap(
    targetRef,
    overlayRef,
    session.id,
    session.workspace_id,
    state,
    persistent.save,
  );
  const layers = persistent.layers.data ?? [];
  const [layerErrors, setLayerErrors] = useState<Readonly<Record<string, string>>>({});
  const layerError = useCallback((id: string, error: string | null) => {
    setLayerErrors(current => {
      if (current[id] === error || (current[id] === undefined && error === null)) return current;
      const next = { ...current };
      if (error === null) delete next[id];
      else next[id] = error;
      return next;
    });
  }, []);
  const presentation = useMapPresentation(map, state, layers, Object.keys(layerErrors).length > 0);

  return (
    <div
      className="kunyu-map chat-surface-container relative h-full overflow-hidden bg-muted"
      aria-label={content.label}
    >
      <div ref={targetRef} className="absolute inset-0" />
      <MapToolbar map={map} />
      <MapLayers map={map} state={state} workspaceId={session.workspace_id} layers={layers} onError={layerError} />
      <AnalysisPanel sessionId={session.id} state={state} layers={layers} error={persistent.layers.isError || Object.keys(layerErrors).length > 0} />
      {presentation.pendingFocus && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-4 left-1/2 z-10 -translate-x-1/2 shadow-sm"
          onClick={presentation.focus}
        >
          {zhCN.mapConversation.locate}
        </Button>
      )}
      {presentation.receiptError && (
        <p
          role="alert"
          className="absolute top-16 right-4 z-10 rounded-lg bg-background/95 px-3 py-2 text-xs text-destructive"
        >
          {zhCN.mapConversation.receiptFailed}
          <Button variant="ghost" size="sm" onClick={presentation.retryReceipt}>
            {zhCN.mapConversation.retry}
          </Button>
        </p>
      )}
      {persistent.saveFailed && (
        <div
          className="absolute top-16 right-32 z-10 rounded-lg bg-background px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {zhCN.analysis.saveFailed}
        </div>
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
