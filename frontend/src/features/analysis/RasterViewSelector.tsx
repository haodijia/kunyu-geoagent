import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppUiStore } from "@/app/store";
import {
  analysisApi,
  analysisKeys,
  type AnalysisOutput,
  type MapLayer,
} from "@/features/analysis/api";
import { rasterCopy as copy } from "@/locales/zh-CN/raster-views";

export function RasterViewSelector({
  sessionId,
  layer,
  outputs,
}: {
  readonly sessionId: string;
  readonly layer: MapLayer | undefined;
  readonly outputs: readonly AnalysisOutput[];
}) {
  const client = useQueryClient();
  const output = outputs.find((item) => item.id === layer?.output_id);
  const views = output?.metadata.views ?? [];
  const mutation = useMutation({
    mutationFn: async (id: string) => {
      const next = await analysisApi.addLayer(sessionId, output!.id, id);
      if (layer !== undefined && layer.id !== next.id && layer.visible)
        await analysisApi.style(sessionId, layer, { visible: false });
      useAppUiStore.getState().inspectMapLayer(sessionId, next.id);
    },
    onError: (reason) =>
      console.error("[map] Switching raster view failed", reason),
    onSettled: () =>
      client.invalidateQueries({ queryKey: analysisKeys.layers(sessionId) }),
  });
  if (views.length === 0) return null;
  return (
    <div className="space-y-1.5 border-t border-border/60 px-3 py-2">
      <label
        className="block text-[10px] text-muted-foreground"
        htmlFor={`view-${sessionId}`}
      >
        {copy.switchView}
      </label>
      <select
        id={`view-${sessionId}`}
        value={layer?.view_id ?? ""}
        disabled={mutation.isPending}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        onChange={(event) => mutation.mutate(event.target.value)}
      >
        {[...new Set(views.map((p) => p.group))].map((group) => (
          <optgroup key={group} label={group}>
            {views
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
        <p role="alert" className="text-xs text-destructive">
          {mutation.error.message}
        </p>
      )}
    </div>
  );
}
