import { useAppUiStore } from "@/app/store";
import {
  analysisApi,
  analysisKeys,
  type AnalysisOutput,
  type MapLayer,
} from "@/features/analysis/api";
import { rasterCopy as copy } from "@/locales/zh-CN/raster-views";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, defineComponent, reactive } from "vue";
export const RasterViewSelector = defineComponent(
  (
    componentProps: {
      readonly sessionId: string;
      readonly layer: MapLayer | undefined;
      readonly outputs: readonly AnalysisOutput[];
    },
    { slots: _slots },
  ) => {
    const sessionId = computed(() => componentProps.sessionId),
      layer = computed(() => componentProps.layer),
      outputs = computed(() => componentProps.outputs);
    const client = useQueryClient();
    const output = computed(() =>
      outputs.value.find((item) => item.id === layer.value?.output_id),
    );
    const views = computed(() => output.value?.metadata.views ?? []);
    const mutation = reactive(
      useMutation({
        mutationFn: async (id: string) => {
          const next = await analysisApi.addLayer(
            sessionId.value,
            output.value!.id,
            id,
          );
          if (
            layer.value !== undefined &&
            layer.value.id !== next.id &&
            layer.value.visible
          )
            await analysisApi.style(sessionId.value, layer.value, {
              visible: false,
            });
          useAppUiStore().inspectMapLayer(sessionId.value, next.id);
        },
        onError: (reason) =>
          console.error("[map] Switching raster view failed", reason),
        onSettled: () =>
          client.invalidateQueries({
            queryKey: analysisKeys.layers(sessionId.value),
          }),
      }),
    );
    return () => {
      const _views = views.value,
        _sessionId = sessionId.value,
        _layer = layer.value;
      if (_views.length === 0) return null;
      return (
        <div class="space-y-1.5 border-t border-border/60 px-3 py-2">
          <label
            class="block text-[10px] text-muted-foreground"
            for={`view-${_sessionId}`}
          >
            {copy.switchView}
          </label>
          <select
            id={`view-${_sessionId}`}
            value={_layer?.view_id ?? ""}
            disabled={mutation.isPending}
            class="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            onChange={(event) =>
              mutation.mutate((event.target as HTMLInputElement).value)
            }
          >
            {[...new Set(_views.map((p) => p.group))].map((group) => (
              <optgroup key={group} label={group}>
                {_views
                  .filter((p) => p.group === group)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {mutation.isError && (
            <p role="alert" class="text-xs text-destructive">
              {mutation.error.message}
            </p>
          )}
        </div>
      );
    };
  },
  {
    name: "RasterViewSelector",
    inheritAttrs: false,
    props: ["sessionId", "layer", "outputs"],
  },
);
