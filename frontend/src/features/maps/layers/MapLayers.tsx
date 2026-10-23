import { getRuntimeConnection } from "@/api/runtime";
import {
  analysisApi,
  analysisKeys,
  workspaceResultsPath,
  type MapLayer,
} from "@/features/analysis/api";
import { useQuery } from "@tanstack/react-query";
import { useLayerPreview } from "@/features/maps/layers/useLayerPreview";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { zhCN } from "@/locales/zh-CN";
import type { Map as LibreMap } from "maplibre-gl";
import { useEffect } from "react";

type SessionMap = ReturnType<typeof useSessionMap>;

export function MapLayers({
  map,
  workspaceId,
  layers,
  comparison,
  onError,
}: {
  readonly map: SessionMap;
  readonly workspaceId: string;
  readonly layers: readonly MapLayer[];
  readonly comparison: readonly [string, string] | null;
  readonly onError: (layerId: string, error: string | null) => void;
}) {
  return layers.map((layer) => (
    <LayerSource
      key={layer.id}
      map={map}
      workspaceId={workspaceId}
      layer={layer}
      layers={layers}
      renderable={layer.visible || comparison?.includes(layer.id) === true}
      onError={onError}
    />
  ));
}

function LayerSource({
  map,
  workspaceId,
  layer,
  layers,
  renderable,
  onError,
}: {
  readonly map: SessionMap;
  readonly workspaceId: string;
  readonly layer: MapLayer;
  readonly layers: readonly MapLayer[];
  readonly renderable: boolean;
  readonly onError: (layerId: string, error: string | null) => void;
}) {
  const instance = map.getMap();
  const preview = useLayerPreview(
    layer.session_id,
    layer.id,
    layer.image !== null && renderable,
  );
  const footprint = layer.image?.footprint;
  const output = useQuery({
    queryKey: analysisKeys.output(workspaceId, layer.output_id ?? ""),
    queryFn: () => analysisApi.output(workspaceId, layer.output_id!),
    enabled: layer.output_id !== null,
  });
  const resampling =
    output.data?.metadata.display_kind === "classified" ? "nearest" : "linear";
  useEffect(() => {
    const error =
      renderable &&
      (layer.bounds === null ||
        output.isError ||
        (layer.image !== null && preview.error));
    onError(layer.id, error ? zhCN.analysis.previewFailed : null);
    return () => onError(layer.id, null);
  }, [
    layer.id,
    renderable,
    layer.bounds,
    layer.image,
    preview.error,
    output.isError,
    onError,
  ]);
  useEffect(() => {
    if (!map.ready || instance === null || layer.bounds === null) return;
    if (layer.image !== null) {
      if (
        !renderable ||
        preview.url === null ||
        footprint === null ||
        footprint === undefined
      )
        return;
      const coordinates = footprint.slice(0, 4).map((point) => [...point]) as [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
      ];
      instance.addSource(layer.id, {
        type: "image",
        url: preview.url,
        coordinates,
      });
    } else {
      const url = new URL(
        `${workspaceResultsPath(workspaceId)}/${encodeURIComponent(layer.output_id!)}/tiles/{z}/{x}/{y}.png`,
        getRuntimeConnection().baseUrl,
      ).href
        .replaceAll("%7B", "{")
        .replaceAll("%7D", "}");
      instance.addSource(layer.id, {
        type: "raster",
        tiles: [url],
        tileSize: 256,
        bounds: [...layer.bounds],
        minzoom: 0,
        maxzoom: 24,
      });
    }
    instance.addLayer({
      id: layer.id,
      type: "raster",
      source: layer.id,
      paint: {
        "raster-opacity": layer.opacity,
        "raster-fade-duration": 0,
        "raster-resampling": resampling,
      },
      layout: { visibility: layer.visible ? "visible" : "none" },
    });
    positionLayer(instance, layer, layers);
    return () => {
      if (instance.getStyle() === undefined) return;
      if (instance.getLayer(layer.id) !== undefined)
        instance.removeLayer(layer.id);
      if (instance.getSource(layer.id) !== undefined)
        instance.removeSource(layer.id);
    };
  }, [
    instance,
    map.ready,
    layer.id,
    layer.output_id,
    layer.image,
    layer.bounds,
    layer.visible,
    renderable,
    preview.url,
    footprint,
    workspaceId,
  ]);
  useEffect(() => {
    if (
      !map.ready ||
      instance === null ||
      instance.getLayer(layer.id) === undefined
    )
      return;
    instance.setPaintProperty(layer.id, "raster-opacity", layer.opacity);
    instance.setPaintProperty(layer.id, "raster-resampling", resampling);
    instance.setLayoutProperty(
      layer.id,
      "visibility",
      layer.visible ? "visible" : "none",
    );
    positionLayer(instance, layer, layers);
  }, [instance, map.ready, layer, layers, preview.url, resampling]);
  return null;
}

function positionLayer(
  instance: LibreMap,
  layer: MapLayer,
  layers: readonly MapLayer[],
) {
  const higher = layers
    .filter(
      (item) =>
        item.position > layer.position &&
        instance.getLayer(item.id) !== undefined,
    )
    .sort((a, b) => a.position - b.position)[0];
  const before =
    higher?.id ??
    instance.getStyle().layers.find((item) => item.type === "symbol")?.id;
  instance.moveLayer(layer.id, before);
}
