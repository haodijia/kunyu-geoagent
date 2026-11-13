import { resolveResourceUrl } from "@/api/runtime";
import {
  analysisApi,
  analysisKeys,
  workspaceResultsPath,
  type MapLayer,
} from "@/features/analysis/api";
import { rasterView } from "@/features/analysis/raster-views";
import { useLayerPreview } from "@/features/maps/layers/useLayerPreview";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQuery } from "@tanstack/vue-query";
import type { Map as LibreMap } from "maplibre-gl";
import { computed, defineComponent, reactive } from "vue";
type SessionMap = ReturnType<typeof useSessionMap>;
export const MapLayers = defineComponent(
  (
    componentProps: {
      readonly map: SessionMap;
      readonly workspaceId: string;
      readonly layers: readonly MapLayer[];
      readonly comparison: readonly [string, string] | null;
      readonly onError: (layerId: string, error: string | null) => void;
    },
    { slots: _slots },
  ) => {
    const map = computed(() => componentProps.map),
      workspaceId = computed(() => componentProps.workspaceId),
      layers = computed(() => componentProps.layers),
      comparison = computed(() => componentProps.comparison),
      onError = computed(() => componentProps.onError);
    return () => {
      const _layers = layers.value,
        _map = map.value,
        _workspaceId = workspaceId.value,
        _comparison = comparison.value,
        _onError = onError.value;
      return _layers.map((layer) => (
        <LayerSource
          key={layer.id}
          map={_map}
          workspaceId={_workspaceId}
          layer={layer}
          layers={_layers}
          renderable={layer.visible || _comparison?.includes(layer.id) === true}
          onError={_onError}
        />
      ));
    };
  },
  {
    name: "MapLayers",
    inheritAttrs: false,
    props: ["map", "workspaceId", "layers", "comparison", "onError"],
  },
);
const LayerSource = defineComponent(
  (
    componentProps: {
      readonly map: SessionMap;
      readonly workspaceId: string;
      readonly layer: MapLayer;
      readonly layers: readonly MapLayer[];
      readonly renderable: boolean;
      readonly onError: (layerId: string, error: string | null) => void;
    },
    { slots: _slots },
  ) => {
    const map = computed(() => componentProps.map),
      workspaceId = computed(() => componentProps.workspaceId),
      layer = computed(() => componentProps.layer),
      layers = computed(() => componentProps.layers),
      renderable = computed(() => componentProps.renderable),
      onError = computed(() => componentProps.onError);
    const instance = computed(() => map.value.getMap());
    const preview = useLayerPreview(
      () => layer.value.session_id,
      () => layer.value.id,
      () => layer.value.image !== null && renderable.value,
    );
    const footprint = computed(() => layer.value.image?.footprint);
    const output = reactive(
      useQuery(
        computed(() => ({
          queryKey: analysisKeys.output(
            workspaceId.value,
            layer.value.output_id ?? "",
          ),
          queryFn: () =>
            analysisApi.output(workspaceId.value, layer.value.output_id!),
          enabled: layer.value.output_id !== null,
        })),
      ),
    );
    const resampling = computed(() =>
      output.data !== undefined &&
      rasterView(output.data, layer.value.view_id!).style.type === "classified"
        ? "nearest"
        : "linear",
    );
    watchMounted(
      [
        () => layer.value.id,
        () => renderable.value,
        () => layer.value.bounds,
        () => layer.value.image,
        () => preview.error,
        () => output.isError,
        () => onError.value,
      ],
      () => {
        const error =
          renderable.value &&
          (layer.value.bounds === null ||
            output.isError ||
            (layer.value.image !== null && preview.error));
        onError.value(
          layer.value.id,
          error ? zhCN.analysis.previewFailed : null,
        );
        return () => onError.value(layer.value.id, null);
      },
    );
    watchMounted(
      [
        () => instance.value,
        () => map.value.ready,
        () => layer.value.id,
        () => layer.value.output_id,
        () => layer.value.view_id,
        () => layer.value.revision,
        () => layer.value.image,
        () => layer.value.bounds,
        () => layer.value.visible,
        () => renderable.value,
        () => preview.url,
        () => footprint.value,
        () => workspaceId.value,
      ],
      () => {
        const activeMap = instance.value;
        const activeLayer = layer.value;
        if (
          !map.value.ready ||
          activeMap === null ||
          layer.value.bounds === null
        )
          return;
        if (layer.value.image !== null) {
          if (
            !renderable.value ||
            preview.url === null ||
            footprint.value === null ||
            footprint.value === undefined
          )
            return;
          const coordinates = footprint.value
            .slice(0, 4)
            .map((point) => [...point]) as [
            [number, number],
            [number, number],
            [number, number],
            [number, number],
          ];
          activeMap.addSource(layer.value.id, {
            type: "image",
            url: preview.url,
            coordinates,
          });
        } else {
          const url = resolveResourceUrl(
            `${workspaceResultsPath(workspaceId.value)}/${encodeURIComponent(layer.value.output_id!)}/tiles/{z}/{x}/{y}.png?view_id=${encodeURIComponent(layer.value.view_id!)}&revision=${layer.value.revision}`,
          )
            .replaceAll("%7B", "{")
            .replaceAll("%7D", "}");
          activeMap.addSource(layer.value.id, {
            type: "raster",
            tiles: [url],
            tileSize: 256,
            bounds: [...layer.value.bounds],
            minzoom: 0,
            maxzoom: 24,
          });
        }
        activeMap.addLayer({
          id: layer.value.id,
          type: "raster",
          source: layer.value.id,
          paint: {
            "raster-opacity": layer.value.opacity,
            "raster-fade-duration": 0,
            "raster-resampling": resampling.value,
          },
          layout: {
            visibility: layer.value.visible ? "visible" : "none",
          },
        });
        positionLayer(activeMap, layer.value, layers.value);
        return () => {
          const _instance = activeMap,
            _layer = activeLayer;
          if (_instance.getStyle() === undefined) return;
          if (_instance.getLayer(_layer.id) !== undefined)
            _instance.removeLayer(_layer.id);
          if (_instance.getSource(_layer.id) !== undefined)
            _instance.removeSource(_layer.id);
        };
      },
    );
    watchMounted(
      [
        () => instance.value,
        () => map.value.ready,
        () => layer.value,
        () => layers.value,
        () => preview.url,
        () => resampling.value,
      ],
      () => {
        if (
          !map.value.ready ||
          instance.value === null ||
          instance.value.getLayer(layer.value.id) === undefined
        )
          return;
        instance.value.setPaintProperty(
          layer.value.id,
          "raster-opacity",
          layer.value.opacity,
        );
        instance.value.setPaintProperty(
          layer.value.id,
          "raster-resampling",
          resampling.value,
        );
        instance.value.setLayoutProperty(
          layer.value.id,
          "visibility",
          layer.value.visible ? "visible" : "none",
        );
        positionLayer(instance.value, layer.value, layers.value);
      },
    );
    return () => {
      return null;
    };
  },
  {
    name: "LayerSource",
    inheritAttrs: false,
    props: ["map", "workspaceId", "layer", "layers", "renderable", "onError"],
  },
);
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
