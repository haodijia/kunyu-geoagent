import { watchMounted } from "@/lib/lifecycle";
import type { FeatureCollection } from "geojson";
import type { ExpressionSpecification, Map } from "maplibre-gl";

export function useReviewOverlay(
  map: () => Map | null,
  ready: () => boolean,
  overlay: () => FeatureCollection | null,
) {
  watchMounted([map, ready, overlay], () => {
    const instance = map();
    const data = overlay();
    if (!ready() || instance === null || data === null) return;

    const source = "review-objects";
    const fill = source + "-fill";
    const halo = source + "-halo";
    const outline = source + "-outline";
    const color: ExpressionSpecification = [
      "case",
      ["==", ["get", "candidate"], true],
      "#e56826",
      "#7161b3",
    ];
    instance.addSource(source, { type: "geojson", data });
    instance.addLayer({
      id: fill,
      type: "fill",
      source,
      paint: {
        "fill-color": color,
        "fill-opacity": 0.18,
      },
    });
    instance.addLayer({
      id: halo,
      type: "line",
      source,
      paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.9 },
      layout: { "line-cap": "round", "line-join": "round" },
    });
    instance.addLayer({
      id: outline,
      type: "line",
      source,
      paint: { "line-color": color, "line-width": 2.5 },
      layout: { "line-cap": "round", "line-join": "round" },
    });
    return () => {
      if (instance.getStyle() === undefined) return;
      for (const id of [outline, halo, fill])
        if (instance.getLayer(id) !== undefined) instance.removeLayer(id);
      if (instance.getSource(source) !== undefined)
        instance.removeSource(source);
    };
  });
}
