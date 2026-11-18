import { watchMounted } from "@/lib/lifecycle";
import type {
  ExpressionSpecification,
  Map as LibreMap,
  MapMouseEvent,
} from "maplibre-gl";
import type {
  ObjectVectors,
  ReviewVector,
  ReviewVectorProperties,
} from "./object-review";

const source = "review-objects";
const fill = source + "-fill";
const outline = source + "-outline";
const points = source + "-points";

export function useReviewOverlay(
  map: () => LibreMap | null,
  ready: () => boolean,
  overlay: () => ObjectVectors | null,
  selected: () => ReviewVectorProperties | null,
  inspectable: () => boolean,
  onPick: (features: ReviewVector[]) => void,
) {
  watchMounted([map, ready, overlay], () => {
    const instance = map();
    const data = overlay();
    if (!ready() || instance === null || data === null) return;
    const activeMap = instance;
    const features = new Map(
      data.features.map((feature) => [feature.id, feature]),
    );
    instance.addSource(source, { type: "geojson", data });
    instance.addLayer({
      id: fill,
      type: "fill",
      source,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#ee8e46", "fill-opacity": 0.03 },
    });
    instance.addLayer({
      id: outline,
      type: "line",
      source,
      filter: ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]],
      paint: { "line-color": "#33576a", "line-width": 1 },
    });
    instance.addLayer({
      id: points,
      type: "circle",
      source,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": "#33576a",
        "circle-radius": 2,
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 0.6,
      },
    });

    function pick(event: MapMouseEvent) {
      if (!inspectable()) return;
      const { x, y } = event.point;
      const hits = activeMap.queryRenderedFeatures(
        [
          [x - 4, y - 4],
          [x + 4, y + 4],
        ],
        { layers: [points, outline, fill] },
      );
      const ids = new Set<string>();
      const candidates = [];
      for (const hit of hits) {
        const id = `${hit.properties.dataset_id}:${hit.properties.feature_index}`;
        const feature = features.get(id);
        if (feature && !ids.has(id)) {
          ids.add(id);
          candidates.push(feature);
        }
      }
      if (candidates.length > 0) onPick(candidates);
    }
    instance.on("click", pick);
    return () => {
      instance.off("click", pick);
      if (instance.getStyle() === undefined) return;
      for (const id of [points, outline, fill])
        if (instance.getLayer(id) !== undefined) instance.removeLayer(id);
      if (instance.getSource(source) !== undefined)
        instance.removeSource(source);
    };
  });

  watchMounted([map, ready, overlay, selected], () => {
    const instance = map();
    if (instance === null || !ready() || !instance.getLayer(outline)) return;
    const feature = selected();
    const match: ExpressionSpecification = [
      "all",
      ["==", ["get", "dataset_id"], feature?.dataset_id ?? ""],
      ["==", ["get", "feature_index"], feature?.feature_index ?? -1],
    ];
    const color: ExpressionSpecification = [
      "case",
      match,
      "#e86d24",
      "#33576a",
    ];
    instance.setPaintProperty(outline, "line-color", color);
    instance.setPaintProperty(outline, "line-width", ["case", match, 3, 1]);
    instance.setPaintProperty(outline, "line-opacity", [
      "case",
      match,
      1,
      0.45,
    ]);
    instance.setPaintProperty(points, "circle-color", color);
    instance.setPaintProperty(points, "circle-radius", [
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      ["case", match, 5, 1.6],
      16,
      ["case", match, 5, 2.8],
    ]);
    instance.setPaintProperty(points, "circle-opacity", [
      "case",
      match,
      1,
      0.55,
    ]);
    instance.setPaintProperty(fill, "fill-opacity", ["case", match, 0.2, 0.03]);
  });
}
