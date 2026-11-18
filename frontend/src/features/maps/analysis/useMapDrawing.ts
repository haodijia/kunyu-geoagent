import type { RegionGeometry } from "@/features/analysis/raster";
import type { MapSelection } from "@/features/sessions/map-context";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import type { Position } from "geojson";
import { GeoJSONSource, type Map, type MapMouseEvent } from "maplibre-gl";
import {
  shallowReactive,
  shallowRef,
  toValue,
  type MaybeRefOrGetter,
} from "vue";
export type DrawingMode = "rectangle" | "polygon";
const selectionColor = "#6855c7";
export function useMapDrawing(
  map: MaybeRefOrGetter<Map | null>,
  ready: MaybeRefOrGetter<boolean>,
  onComplete: (geometry: RegionGeometry) => void,
  initialMode: MaybeRefOrGetter<DrawingMode> = "rectangle",
) {
  const mode = shallowRef<DrawingMode>(toValue(initialMode)),
    setMode = refSetter(mode);
  watchMounted(
    [
      () => toValue(map),
      () => toValue(ready),
      () => mode.value,
      () => onComplete,
    ],
    () => {
      const instance = toValue(map);
      if (instance === null || !toValue(ready)) return;
      const canvas = instance.getCanvas();
      const previous = {
        cursor: canvas.style.cursor,
        pan: instance.dragPan.isEnabled(),
        doubleZoom: instance.doubleClickZoom.isEnabled(),
        boxZoom: instance.boxZoom.isEnabled(),
      };
      instance.doubleClickZoom.disable();
      instance.boxZoom.disable();
      if (mode.value === "rectangle") instance.dragPan.disable();
      canvas.style.cursor = "crosshair";
      const source = "map-selection-drawing";
      instance.addSource(source, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });
      instance.addLayer({
        id: source + "-fill",
        type: "fill",
        source,
        paint: {
          "fill-color": selectionColor,
          "fill-opacity": 0.1,
        },
      });
      instance.addLayer({
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
        const data = instance.getSource(source);
        if (data instanceof GeoJSONSource)
          data.setData({
            type: "FeatureCollection",
            features: [],
          });
      };
      const draw = (ring: Position[]) => {
        const data = instance.getSource(source);
        if (!(data instanceof GeoJSONSource) || ring.length < 2) return;
        data.setData({
          type: "Feature",
          properties: {},
          geometry:
            ring.length < 3
              ? {
                  type: "LineString",
                  coordinates: ring,
                }
              : {
                  type: "Polygon",
                  coordinates: [[...ring, ring[0]!]],
                },
        });
      };
      const finish = (ring: Position[]) => {
        onComplete({
          type: "Polygon",
          coordinates: [[...ring, ring[0]!]],
        });
        points = [];
        clear();
      };
      const position = (event: PointerEvent): [number, number] => {
        const rect = canvas.getBoundingClientRect();
        return [event.clientX - rect.left, event.clientY - rect.top];
      };
      const rectangle = (
        a: [number, number],
        b: [number, number],
      ): Position[] =>
        [a, [b[0], a[1]], b, [a[0], b[1]]].map((point) => {
          const ll = instance.unproject(point as [number, number]);
          return [ll.lng, ll.lat];
        });
      const down = (event: PointerEvent) => {
        if (
          mode.value !== "rectangle" ||
          event.button !== 0 ||
          !event.isPrimary
        )
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
        if (
          Math.abs(start[0] - end[0]) >= 5 &&
          Math.abs(start[1] - end[1]) >= 5
        )
          finish(rectangle(start, end));
      };
      const click = (event: MapMouseEvent) => {
        if (mode.value !== "polygon" || event.originalEvent.detail > 1) return;
        points.push([event.lngLat.lng, event.lngLat.lat]);
        draw(points);
      };
      const hover = (event: MapMouseEvent) => {
        if (mode.value === "polygon" && points.length > 0)
          draw([...points, [event.lngLat.lng, event.lngLat.lat]]);
      };
      const doubleClick = (event: MapMouseEvent) => {
        if (mode.value !== "polygon") return;
        event.preventDefault();
        if (points.length >= 3) finish(points);
      };
      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", cancel);
      canvas.addEventListener("lostpointercapture", cancel);
      instance.on("click", click);
      instance.on("mousemove", hover);
      instance.on("dblclick", doubleClick);
      return () => {
        canvas.removeEventListener("pointerdown", down);
        canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("pointercancel", cancel);
        canvas.removeEventListener("lostpointercapture", cancel);
        instance.off("click", click);
        instance.off("mousemove", hover);
        instance.off("dblclick", doubleClick);
        cancel();
        canvas.style.cursor = previous.cursor;
        if (instance.getStyle() === undefined) return;
        if (previous.pan) instance.dragPan.enable();
        if (previous.doubleZoom) instance.doubleClickZoom.enable();
        if (previous.boxZoom) instance.boxZoom.enable();
        for (const layer of [source, source + "-fill"])
          if (instance.getLayer(layer) !== undefined)
            instance.removeLayer(layer);
        if (instance.getSource(source) !== undefined)
          instance.removeSource(source);
      };
    },
  );
  return shallowReactive({
    get mode() {
      return mode.value;
    },
    get setMode() {
      return setMode;
    },
  });
}
export function useSelectionOverlay(
  map: MaybeRefOrGetter<Map | null>,
  ready: MaybeRefOrGetter<boolean>,
  geometry: MaybeRefOrGetter<MapSelection["geometry"] | null>,
) {
  watchMounted(
    [() => toValue(map), () => toValue(ready), () => toValue(geometry)],
    () => {
      const instance = toValue(map);
      const selection = toValue(geometry);
      if (instance === null || !toValue(ready) || selection === null) return;
      const id = "map-selection";
      instance.addSource(id, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: selection,
        },
      });
      if (selection.type === "Point") {
        instance.addLayer({
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
        if (selection.type === "Polygon" || selection.type === "MultiPolygon")
          instance.addLayer({
            id: id + "-fill",
            type: "fill",
            source: id,
            paint: {
              "fill-color": selectionColor,
              "fill-opacity": 0.07,
            },
          });
        instance.addLayer({
          id,
          type: "line",
          source: id,
          paint: {
            "line-color": selectionColor,
            "line-width": 1.5,
          },
        });
      }
      return () => {
        if (instance.getStyle() === undefined) return;
        for (const layer of [id, id + "-fill"])
          if (instance.getLayer(layer) !== undefined)
            instance.removeLayer(layer);
        if (instance.getSource(id) !== undefined) instance.removeSource(id);
      };
    },
  );
}
