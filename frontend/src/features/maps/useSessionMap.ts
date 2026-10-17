import {
  AttributionControl,
  Map,
  ScaleControl,
  setWorkerUrl,
  type ErrorEvent,
  type LngLatBoundsLike,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef, useState, type RefObject } from "react";

import { useAppUiStore } from "@/app/store";
import {
  MAP_HILLSHADE_COLORS,
  MAP_LOAD_TIMEOUT_MS,
  MAP_STYLES,
  MAP_TERRAIN,
} from "@/features/maps/config";
import {
  INITIAL_MAP_VIEWPORT,
  type MapCamera,
  type MapViewport,
  type MapDimension,
} from "@/features/sessions/map-context";
import { zhCN } from "@/locales/zh-CN";

import type { MapState } from "@/features/analysis/api";
import { getRuntimeConnection } from "@/api/runtime";

setWorkerUrl(workerUrl);

function currentTheme() {
  const theme = document.documentElement.dataset.theme;
  if (theme !== "light" && theme !== "dark") {
    throw new Error("A resolved application theme is required for the map.");
  }
  return theme;
}

function currentStyle() {
  return MAP_STYLES[currentTheme()];
}

function applyDimension(map: Map, dimension: MapDimension) {
  if (dimension === "3d") {
    for (const sourceId of [
      MAP_TERRAIN.sourceId,
      MAP_TERRAIN.hillshadeSourceId,
    ]) {
      if (map.getSource(sourceId) !== undefined) continue;
      map.addSource(sourceId, {
        type: "raster-dem",
        url: MAP_TERRAIN.url,
        encoding: MAP_TERRAIN.encoding,
        tileSize: MAP_TERRAIN.tileSize,
        maxzoom: MAP_TERRAIN.maxzoom,
        attribution: MAP_TERRAIN.attribution,
      });
    }
    if (map.getLayer(MAP_TERRAIN.hillshadeLayerId) === undefined) {
      const colors = MAP_HILLSHADE_COLORS[currentTheme()];
      const firstLineOrLabel = map
        .getStyle()
        .layers.find(
          (layer) => layer.type === "line" || layer.type === "symbol",
        );
      map.addLayer(
        {
          id: MAP_TERRAIN.hillshadeLayerId,
          type: "hillshade",
          source: MAP_TERRAIN.hillshadeSourceId,
          paint: {
            "hillshade-exaggeration": 0.4,
            "hillshade-shadow-color": colors.shadow,
            "hillshade-highlight-color": colors.highlight,
            "hillshade-accent-color": colors.accent,
          },
        },
        firstLineOrLabel?.id,
      );
    }
    map.setMaxPitch(MAP_TERRAIN.maxPitch);
    map.setTerrain({
      source: MAP_TERRAIN.sourceId,
      exaggeration: MAP_TERRAIN.exaggeration,
    });
  } else {
    map.setTerrain(null);
    map.setMaxPitch(0);
    if (map.getLayer(MAP_TERRAIN.hillshadeLayerId) !== undefined) {
      map.removeLayer(MAP_TERRAIN.hillshadeLayerId);
    }
    for (const sourceId of [
      MAP_TERRAIN.sourceId,
      MAP_TERRAIN.hillshadeSourceId,
    ]) {
      if (map.getSource(sourceId) !== undefined) map.removeSource(sourceId);
    }
  }
}

export function useSessionMap(
  targetRef: RefObject<HTMLDivElement | null>,
  overlayRef: RefObject<HTMLDivElement | null>,
  sessionId: string,
  workspaceId: string,
  initialState: MapState,
  onViewChange: (
    viewport: MapViewport,
    camera: MapCamera,
    appliedFocusRevision: number,
  ) => void,
) {
  const initial = useRef(initialState);
  initial.current = initialState;
  const onView = useRef(onViewChange);
  onView.current = onViewChange;
  const appliedFocus = useRef(initialState.applied_focus_revision);
  const mapRef = useRef<Map | null>(null);
  const overlayHeightRef = useRef(0);
  const dimensionRef = useRef<MapDimension>("2d");
  const [dimension, setDimension] = useState<MapDimension>("2d");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const target = targetRef.current;
    const overlay = overlayRef.current;
    if (target === null || overlay === null || target.parentElement === null) {
      throw new Error("Map container and composer overlay are required.");
    }
    const container = target.parentElement;
    const store = useAppUiStore.getState();
    store.initializeMapContext(sessionId, workspaceId);
    const context = initial.current;
    store.setMapView(sessionId, context.viewport, context.camera);

    dimensionRef.current = context.camera.dimension;
    setDimension(context.camera.dimension);
    setReady(false);
    setLoading(true);
    setFailed(false);

    const reportError = (error: unknown) => {
      console.error("[map] MapLibre resource or rendering failure.", {
        sessionId,
        error,
      });
      setFailed(true);
      setLoading(false);
    };
    let map: Map;
    try {
      map = new Map({
        container: target,
        style: currentStyle(),
        center: [context.viewport.longitude, context.viewport.latitude],
        zoom: context.viewport.zoom,
        minZoom: 0,
        maxZoom: 24,
        bearing: context.camera.bearing,
        pitch: context.camera.pitch,
        maxPitch: context.camera.dimension === "3d" ? MAP_TERRAIN.maxPitch : 0,
        attributionControl: false,
        canvasContextAttributes: { antialias: true },
        transformRequest: (url) => {
          const runtime = getRuntimeConnection();
          const targetUrl = new URL(url, runtime.baseUrl);
          if (
            targetUrl.origin === new URL(runtime.baseUrl).origin &&
            targetUrl.pathname.startsWith("/api/")
          ) {
            return {
              url,
              headers: { "X-Kunyu-Session": runtime.sessionToken },
            };
          }
          return { url };
        },
      });
    } catch (error) {
      reportError(error);
      return;
    }
    mapRef.current = map;
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.addControl(
      new ScaleControl({ unit: "metric", maxWidth: 100 }),
      "bottom-left",
    );
    map.getCanvas().setAttribute("aria-label", zhCN.map.label);

    const persistView = () => {
      const center = map.getCenter().wrap();
      const viewport = {
        longitude: center.lng,
        latitude: center.lat,
        zoom: map.getZoom(),
      };
      const camera = {
        dimension: dimensionRef.current,
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      };
      useAppUiStore.getState().setMapView(sessionId, viewport, camera);
      onView.current(viewport, camera, appliedFocus.current);
    };
    const onStyleLoad = () => {
      applyDimension(map, dimensionRef.current);
      setReady(true);
    };
    const onError = (event: ErrorEvent) => reportError(event.error);
    const onContextLost = () => {
      setReady(false);
      reportError(new Error("WebGL context was lost."));
    };
    let loadTimer: ReturnType<typeof setTimeout>;
    const onIdle = () => {
      clearTimeout(loadTimer);
      setLoading(false);
    };
    const startLoadTimer = () => {
      clearTimeout(loadTimer);
      loadTimer = setTimeout(
        () =>
          reportError(
            new Error("Map resources did not finish loading in time."),
          ),
        MAP_LOAD_TIMEOUT_MS,
      );
    };
    let styleUrl = currentStyle();
    const themeObserver = new MutationObserver(() => {
      const nextStyle = currentStyle();
      if (nextStyle === styleUrl) return;
      styleUrl = nextStyle;
      setReady(false);
      setLoading(true);
      startLoadTimer();
      map.setStyle(nextStyle, { diff: false });
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const resize = () => {
      const overlayHeight =
        container.getBoundingClientRect().bottom - overlay.getBoundingClientRect().top;
      overlayHeightRef.current = overlayHeight;
      container.style.setProperty("--map-overlay-height", `${overlayHeight}px`);
      map.setPadding({ ...map.getPadding(), bottom: overlayHeight });
      map.resize();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(target);
    resizeObserver.observe(overlay);
    resize();
    map.on("style.load", onStyleLoad);
    map.on("moveend", persistView);
    map.on("idle", onIdle);
    map.on("error", onError);
    map.on("webglcontextlost", onContextLost);
    startLoadTimer();

    return () => {
      persistView();
      clearTimeout(loadTimer);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      map.off("style.load", onStyleLoad);
      map.off("moveend", persistView);
      map.off("idle", onIdle);
      map.off("error", onError);
      map.off("webglcontextlost", onContextLost);
      mapRef.current = null;
      map.remove();
    };
  }, [attempt, overlayRef, sessionId, targetRef, workspaceId]);

  function focusBounds(bounds: LngLatBoundsLike) {
    const map = mapRef.current;
    if (map === null || !ready) return;
    map.fitBounds(bounds, {
      // Replace layout padding: additive fit padding shifts the geographic center.
      absolutePadding: true,
      padding: {
        top: 40,
        right: 60,
        bottom: overlayHeightRef.current + 30,
        left: Math.min(340, map.getContainer().clientWidth * 0.4),
      },
      maxZoom: 14,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700,
    });
  }

  function changeDimension(next: MapDimension) {
    const map = mapRef.current;
    if (map === null || !ready || next === dimensionRef.current) return;
    dimensionRef.current = next;
    setDimension(next);
    applyDimension(map, next);
    map.easeTo({ pitch: next === "3d" ? MAP_TERRAIN.pitch : 0, duration: 600 });
  }

  function resetView() {
    mapRef.current?.easeTo({
      center: [INITIAL_MAP_VIEWPORT.longitude, INITIAL_MAP_VIEWPORT.latitude],
      zoom: INITIAL_MAP_VIEWPORT.zoom,
      bearing: 0,
      pitch: dimensionRef.current === "3d" ? MAP_TERRAIN.pitch : 0,
      duration: 600,
    });
  }

  return {
    getMap: () => mapRef.current,
    markFocusApplied: (revision: number) => {
      appliedFocus.current = revision;
    },
    appliedFocusRevision: appliedFocus,
    dimension,
    ready,
    focusBounds,
    loading,
    failed,
    changeDimension,
    resetView,
    resetNorth: () => mapRef.current?.easeTo({ bearing: 0, duration: 400 }),
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    reload: () => setAttempt((value) => value + 1),
  };
}
