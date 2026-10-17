import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getRuntimeConnection } from "@/api/runtime";
import {
  analysisApi,
  analysisKeys,
  workspaceResultsPath,
  type AnalysisOutput,
  type MapLayer,
  type MapState,
} from "@/features/analysis/api";
import type { useSessionMap } from "./useSessionMap";

export function useAnalysisLayers(
  map: ReturnType<typeof useSessionMap>,
  state: MapState,
  layers: readonly MapLayer[],
  outputs: readonly AnalysisOutput[],
) {
  const client = useQueryClient();
  const installed = useRef(new Set<string>());
  useEffect(() => {
    const instance = map.getMap();
    if (!map.ready || instance === null) return;
    const wanted = new Set(layers.map((layer) => layer.id));
    for (const id of installed.current) {
      if (wanted.has(id)) continue;
      if (instance.getLayer(id) !== undefined) instance.removeLayer(id);
      if (instance.getSource(id) !== undefined) instance.removeSource(id);
    }
    const before = instance
      .getStyle()
      .layers.find((layer) => layer.type === "symbol")?.id;
    for (const layer of layers) {
      const output = outputs.find((item) => item.id === layer.output_id);
      if (output === undefined) continue;
      if (instance.getSource(layer.id) === undefined) {
        const url = new URL(
          `${workspaceResultsPath(output.workspace_id)}/${encodeURIComponent(output.id)}/tiles/{z}/{x}/{y}.png`,
          getRuntimeConnection().baseUrl,
        ).href
          .replaceAll("%7B", "{")
          .replaceAll("%7D", "}");
        instance.addSource(layer.id, {
          type: "raster",
          tiles: [url],
          tileSize: 256,
          bounds: [...output.bounds],
          minzoom: 0,
          maxzoom: 24,
        });
      }
      if (instance.getLayer(layer.id) === undefined)
        instance.addLayer(
          {
            id: layer.id,
            type: "raster",
            source: layer.id,
            paint: {
              "raster-opacity": layer.opacity,
              "raster-fade-duration": 0,
            },
            layout: { visibility: layer.visible ? "visible" : "none" },
          },
          before,
        );
      instance.setPaintProperty(layer.id, "raster-opacity", layer.opacity);
      instance.setLayoutProperty(
        layer.id,
        "visibility",
        layer.visible ? "visible" : "none",
      );
      instance.moveLayer(layer.id, before);
    }
    installed.current = wanted;
    const onClick = (event: { lngLat: { lng: number; lat: number } }) => {
      const layer = [...layers].reverse().find((item) => {
        if (!item.visible) return false;
        const output = outputs.find((value) => value.id === item.output_id);
        return (
          output !== undefined &&
          event.lngLat.lng >= output.bounds[0] &&
          event.lngLat.lng <= output.bounds[2] &&
          event.lngLat.lat >= output.bounds[1] &&
          event.lngLat.lat <= output.bounds[3]
        );
      });
      if (layer === undefined) return;
      void analysisApi
        .select(state.session_id, layer.output_id)
        .then((value) =>
          client.setQueryData(analysisKeys.map(state.session_id), value),
        )
        .catch((error) =>
          console.error("[map] Selecting a result failed.", error),
        );
    };
    instance.on("click", onClick);
    return () => {
      instance.off("click", onClick);
    };
  }, [client, layers, map, outputs, state.session_id]);
  useEffect(() => {
    const instance = map.getMap();
    if (
      !map.ready ||
      instance === null ||
      state.focus_revision <= map.appliedFocusRevision.current ||
      state.focus_output_id === null
    )
      return;
    const output = outputs.find((item) => item.id === state.focus_output_id);
    if (output === undefined) return;
    map.markFocusApplied(state.focus_revision);
    map.focusBounds(
      [
        [output.bounds[0], output.bounds[1]],
        [output.bounds[2], output.bounds[3]],
      ],
    );
  }, [map, outputs, state]);
}
