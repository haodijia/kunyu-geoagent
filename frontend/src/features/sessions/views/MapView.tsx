import { MapPinned } from "lucide-react";
import OpenLayersMap from "ol/Map";
import { fromLonLat, toLonLat } from "ol/proj";
import View from "ol/View";
import { useEffect, useRef } from "react";

import "ol/ol.css";

import { useAppUiStore } from "@/app/store";
import { SessionComposer } from "@/features/messages/SessionComposer";
import { AgentControls } from "@/features/agent/AgentControls";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { createMapContext } from "@/features/sessions/map-context";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.sessionWorkspace;

export function MapView() {
  const mapTargetRef = useRef<HTMLDivElement>(null);
  const session = useSessionWorkspace();
  const initializeMapContext = useAppUiStore((state) => state.initializeMapContext);
  const setMapViewport = useAppUiStore((state) => state.setMapViewport);

  useEffect(() => {
    initializeMapContext(session.id, session.workspace_id);
  }, [initializeMapContext, session.id, session.workspace_id]);

  useEffect(() => {
    const target = mapTargetRef.current;
    if (target === null) {
      throw new Error("Map target element is required.");
    }

    const mapContext = useAppUiStore.getState().mapContextBySession[session.id]
      ?? createMapContext(session.workspace_id);
    const map = new OpenLayersMap({
      controls: [],
      layers: [],
      target,
      view: new View({
        center: fromLonLat([
          mapContext.viewport.longitude,
          mapContext.viewport.latitude
        ]),
        zoom: mapContext.viewport.zoom
      })
    });
    const persistViewport = () => {
      const center = map.getView().getCenter();
      const zoom = map.getView().getZoom();
      if (center === undefined || zoom === undefined) {
        console.error("[map] OpenLayers view is missing a center or zoom.", {
          sessionId: session.id
        });
        return;
      }
      const coordinates = toLonLat(center);
      const longitude = coordinates[0];
      const latitude = coordinates[1];
      if (longitude === undefined || latitude === undefined) {
        console.error("[map] OpenLayers view returned invalid coordinates.", {
          sessionId: session.id
        });
        return;
      }
      setMapViewport(session.id, session.workspace_id, {
        latitude,
        longitude,
        zoom
      });
    };
    map.on("moveend", persistViewport);
    const resizeObserver = new ResizeObserver(() => map.updateSize());
    resizeObserver.observe(target);

    return () => {
      persistViewport();
      map.un("moveend", persistViewport);
      resizeObserver.disconnect();
      map.setTarget(undefined);
    };
  }, [session.id, session.workspace_id, setMapViewport]);

  return (
    <div className="chat-surface-container relative h-full overflow-hidden bg-muted">
      <div ref={mapTargetRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
        <div className="max-w-sm rounded-2xl border border-border bg-background/95 px-7 py-6 text-center shadow-sm backdrop-blur">
          <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-secondary-foreground">
            <MapPinned className="size-5" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <h1 className="m-0 text-base font-semibold tracking-normal text-foreground">
            {content.mapEmptyTitle}
          </h1>
          <p className="mt-2 mb-0 text-sm leading-6 text-muted-foreground">
            {content.mapEmptyDescription}
          </p>
        </div>
      </div>
      <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-10 [&>*]:pointer-events-auto">
        <AgentControls />
        <SessionComposer />
      </div>
    </div>
  );
}
