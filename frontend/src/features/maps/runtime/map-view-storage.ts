import type { MapView } from "@/features/sessions/map-context";

const key = (sessionId: string) => `kunyu.ui.map-view.${sessionId}`;

export function readMapView(sessionId: string): MapView | null {
  const raw = localStorage.getItem(key(sessionId));
  if (raw === null) return null;
  const value = JSON.parse(raw);
  const viewport = value?.viewport;
  const camera = value?.camera;
  if (viewport === null || typeof viewport !== "object" || camera === null || typeof camera !== "object"
    || ![viewport.longitude, viewport.latitude, viewport.zoom, camera.bearing, camera.pitch].every(item => typeof item === "number" && Number.isFinite(item))
    || Math.abs(viewport.longitude) > 180 || Math.abs(viewport.latitude) > 85.0511287798066 || viewport.zoom < 0 || viewport.zoom > 24
    || !["2d", "3d"].includes(camera.dimension) || Math.abs(camera.bearing) > 180 || camera.pitch < 0 || camera.pitch > 80
    || !(value.expanded_layer_id === null || typeof value.expanded_layer_id === "string"))
    throw new Error("Invalid saved map view.");
  return value as MapView;
}

export function writeMapView(sessionId: string, view: MapView): void {
  localStorage.setItem(key(sessionId), JSON.stringify(view));
}
