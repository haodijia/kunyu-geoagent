import { GeoJSONSource, type Map, type MapMouseEvent } from "maplibre-gl";
import type { Position } from "geojson";
import { useEffect, useState } from "react";
import type { RegionGeometry } from "@/features/analysis/raster";
import type { MapSelection } from "@/features/sessions/map-context";

export type DrawingMode = "rectangle" | "polygon";
const selectionColor = "#6855c7";

export function useMapDrawing(
  map: Map | null,
  ready: boolean,
  onComplete: (geometry: RegionGeometry) => void,
  initialMode: DrawingMode = "rectangle",
) {
  const [mode, setMode] = useState<DrawingMode>(initialMode);
  useEffect(() => {
    if (map === null || !ready) return;
    const canvas = map.getCanvas();
    const previous = {
      cursor: canvas.style.cursor,
      pan: map.dragPan.isEnabled(),
      doubleZoom: map.doubleClickZoom.isEnabled(),
      boxZoom: map.boxZoom.isEnabled(),
    };
    map.doubleClickZoom.disable();
    map.boxZoom.disable();
    if (mode === "rectangle") map.dragPan.disable();
    canvas.style.cursor = "crosshair";
    const source = "map-selection-drawing";
    map.addSource(source, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: source + "-fill",
      type: "fill",
      source,
      paint: { "fill-color": selectionColor, "fill-opacity": 0.1 },
    });
    map.addLayer({
      id: source,
      type: "line",
      source,
      paint: {
        "line-color": selectionColor,
        "line-width": 1.5,
        "line-dasharray": [3, 2],
      },
    });
    let points: Position[] = [];
    let origin: [number, number] | null = null;
    let pointer: number | null = null;
    const clear = () => {
      const data = map.getSource(source);
      if (data instanceof GeoJSONSource)
        data.setData({ type: "FeatureCollection", features: [] });
    };
    const draw = (ring: Position[]) => {
      const data = map.getSource(source);
      if (!(data instanceof GeoJSONSource) || ring.length < 2) return;
      data.setData({
        type: "Feature",
        properties: {},
        geometry:
          ring.length < 3
            ? { type: "LineString", coordinates: ring }
            : { type: "Polygon", coordinates: [[...ring, ring[0]!]] },
      });
    };
    const finish = (ring: Position[]) => {
      onComplete({ type: "Polygon", coordinates: [[...ring, ring[0]!]] });
      points = [];
      clear();
    };
    const position = (event: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    const rectangle = (a: [number, number], b: [number, number]): Position[] =>
      [a, [b[0], a[1]], b, [a[0], b[1]]].map((point) => {
        const ll = map.unproject(point as [number, number]);
        return [ll.lng, ll.lat];
      });
    const down = (event: PointerEvent) => {
      if (mode !== "rectangle" || event.button !== 0 || !event.isPrimary)
        return;
      event.preventDefault();
      origin = position(event);
      pointer = event.pointerId;
      canvas.setPointerCapture(pointer);
    };
    const move = (event: PointerEvent) => {
      if (origin !== null && event.pointerId === pointer)
        draw(rectangle(origin, position(event)));
    };
    const cancel = () => {
      if (pointer !== null && canvas.hasPointerCapture(pointer))
        canvas.releasePointerCapture(pointer);
      origin = null;
      pointer = null;
      clear();
    };
    const up = (event: PointerEvent) => {
      if (origin === null || event.pointerId !== pointer) return;
      const end = position(event);
      const start = origin;
      cancel();
      if (Math.abs(start[0] - end[0]) >= 5 && Math.abs(start[1] - end[1]) >= 5)
        finish(rectangle(start, end));
    };
    const click = (event: MapMouseEvent) => {
      if (mode !== "polygon" || event.originalEvent.detail > 1) return;
      points.push([event.lngLat.lng, event.lngLat.lat]);
      draw(points);
    };
    const hover = (event: MapMouseEvent) => {
      if (mode === "polygon" && points.length > 0)
        draw([...points, [event.lngLat.lng, event.lngLat.lat]]);
    };
    const doubleClick = (event: MapMouseEvent) => {
      if (mode !== "polygon") return;
      event.preventDefault();
      if (points.length >= 3) finish(points);
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("lostpointercapture", cancel);
    map.on("click", click);
    map.on("mousemove", hover);
    map.on("dblclick", doubleClick);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", cancel);
      map.off("click", click);
      map.off("mousemove", hover);
      map.off("dblclick", doubleClick);
      cancel();
      canvas.style.cursor = previous.cursor;
      if (map.getStyle() === undefined) return;
      if (previous.pan) map.dragPan.enable();
      if (previous.doubleZoom) map.doubleClickZoom.enable();
      if (previous.boxZoom) map.boxZoom.enable();
      for (const layer of [source, source + "-fill"])
        if (map.getLayer(layer) !== undefined) map.removeLayer(layer);
      if (map.getSource(source) !== undefined) map.removeSource(source);
    };
  }, [map, ready, mode, onComplete]);
  return { mode, setMode };
}

export function useSelectionOverlay(
  map: Map | null,
  ready: boolean,
  geometry: MapSelection["geometry"] | null,
) {
  useEffect(() => {
    if (map === null || !ready || geometry === null) return;
    const id = "map-selection";
    map.addSource(id, {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry },
    });
    if (geometry.type === "Point") {
      map.addLayer({
        id,
        type: "circle",
        source: id,
        paint: {
          "circle-radius": 5,
          "circle-color": selectionColor,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
        },
      });
    } else {
      map.addLayer({
        id: id + "-fill",
        type: "fill",
        source: id,
        paint: { "fill-color": selectionColor, "fill-opacity": 0.07 },
      });
      map.addLayer({
        id,
        type: "line",
        source: id,
        paint: { "line-color": selectionColor, "line-width": 1.5 },
      });
    }
    return () => {
      if (map.getStyle() === undefined) return;
      for (const layer of [id, id + "-fill"])
        if (map.getLayer(layer) !== undefined) map.removeLayer(layer);
      if (map.getSource(id) !== undefined) map.removeSource(id);
    };
  }, [map, ready, geometry]);
}
