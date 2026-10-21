import { GeoJSONSource, type Map, type MapMouseEvent } from "maplibre-gl";
import type { Position } from "geojson";
import { useEffect, useState } from "react";
import type { RegionGeometry } from "@/features/analysis/raster";

export function useMapDrawing(
  map: Map | null,
  ready: boolean,
  onComplete: (geometry: RegionGeometry) => void,
) {
  const [mode, setMode] = useState<"rectangle" | "polygon" | null>(null);
  useEffect(() => {
    if (map === null || !ready || mode === null) return;
    let points: Position[] = [];
    const doubleZoom = map.doubleClickZoom.isEnabled();
    map.doubleClickZoom.disable();
    const oldCursor = map.getCanvas().style.cursor;
    map.getCanvas().style.cursor = "crosshair";
    const source = "map-selection-drawing";
    map.addSource(source, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: source,
      type: "line",
      source,
      paint: {
        "line-color": "#6366f1",
        "line-width": 3,
        "line-dasharray": [2, 1],
      },
    });
    const finish = (ring: Position[]) => {
      onComplete({ type: "Polygon", coordinates: [[...ring, ring[0]!]] });
      setMode(null);
    };
    const click = (event: MapMouseEvent) => {
      if (mode === "polygon" && event.originalEvent.detail > 1) return;
      const point: Position = [event.lngLat.lng, event.lngLat.lat];
      const last = points.at(-1);
      if (last !== undefined && last[0] === point[0] && last[1] === point[1])
        return;
      points.push(point);
      if (mode === "rectangle" && points.length === 2) {
        const a = points[0]!,
          b = points[1]!;
        finish([
          [a[0]!, a[1]!],
          [b[0]!, a[1]!],
          [b[0]!, b[1]!],
          [a[0]!, b[1]!],
        ]);
      } else if (points.length > 1) {
        const data = map.getSource(source);
        if (data instanceof GeoJSONSource)
          data.setData({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: points },
          });
      }
    };
    const doubleClick = (event: MapMouseEvent) => {
      event.preventDefault();
      if (mode === "polygon" && points.length >= 3) finish(points);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMode(null);
    };
    map.on("click", click);
    map.on("dblclick", doubleClick);
    window.addEventListener("keydown", key);
    return () => {
      map.off("click", click);
      map.off("dblclick", doubleClick);
      window.removeEventListener("keydown", key);
      map.getCanvas().style.cursor = oldCursor;
      if (map.getStyle() === undefined) return;
      if (doubleZoom) map.doubleClickZoom.enable();
      if (map.getLayer(source) !== undefined) map.removeLayer(source);
      if (map.getSource(source) !== undefined) map.removeSource(source);
      points = [];
    };
  }, [map, ready, mode, onComplete]);
  return { mode, setMode };
}

export function useSelectionOverlay(
  map: Map | null,
  ready: boolean,
  geometry: RegionGeometry | null,
) {
  useEffect(() => {
    if (map === null || !ready || geometry === null) return;
    const id = "map-selection";
    map.addSource(id, {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry },
    });
    map.addLayer({
      id: id + "-fill",
      type: "fill",
      source: id,
      paint: { "fill-color": "#6366f1", "fill-opacity": 0.06 },
    });
    map.addLayer({
      id,
      type: "line",
      source: id,
      paint: { "line-color": "#6366f1", "line-width": 2 },
    });
    return () => {
      if (map.getStyle() === undefined) return;
      for (const layer of [id, id + "-fill"])
        if (map.getLayer(layer) !== undefined) map.removeLayer(layer);
      if (map.getSource(id) !== undefined) map.removeSource(id);
    };
  }, [map, ready, geometry]);
}
