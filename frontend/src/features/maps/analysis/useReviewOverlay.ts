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
      paint: { "fill-color": "#14838a", "fill-opacity": 0.12 },
    });
    instance.addLayer({
      id: outline,
      type: "line",
      source,
      paint: { "line-color": "#197d87", "line-width": 1.8 },
    });
    instance.addLayer({
      id: points,
      type: "circle",
      source,
      paint: {
        "circle-color": "#197d87",
        "circle-radius": 4,
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 1,
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
      "#f07926",
      "#197d87",
    ];
    instance.setPaintProperty(outline, "line-color", color);
    instance.setPaintProperty(outline, "line-width", ["case", match, 4, 1.8]);
    instance.setPaintProperty(points, "circle-color", color);
    instance.setPaintProperty(points, "circle-radius", ["case", match, 7, 4]);
    instance.setPaintProperty(fill, "fill-opacity", [
      "case",
      match,
      0.33,
      0.12,
    ]);
  });
}
