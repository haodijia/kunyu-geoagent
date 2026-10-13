import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  LocateFixed,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";
import {
  analysisApi,
  analysisKeys,
  type AnalysisOutput,
  type MapLayer,
} from "./api";
const content = zhCN.analysis;

export function AvailableOutput({
  output,
}: {
  readonly output: AnalysisOutput;
}) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => analysisApi.addLayer(output.session_id, output.id),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: analysisKeys.layers(output.session_id),
      }),
    onError: (error) => console.error("[map] Adding a result failed.", error),
  });
  return (
    <div className="rounded-lg border border-border p-2 text-xs">
      <span>{output.title}</span>
      <Button
        size="sm"
        variant="ghost"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {content.viewMap}
      </Button>
      {mutation.isError && (
        <p className="text-destructive" role="alert">
          {content.actionFailed}
        </p>
      )}
    </div>
  );
}
export function LayerRow({
  layer,
  count,
  selected,
  onSelect,
}: {
  readonly layer: MapLayer;
  readonly count: number;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const client = useQueryClient();
  const [opacity, setOpacity] = useState<number | null>(null);
  const mutation = useMutation({
    mutationFn: async (
      action:
        | "select"
        | "focus"
        | "visibility"
        | "opacity"
        | "remove"
        | "up"
        | "down",
    ) => {
      if (action === "select" || action === "focus") {
        const value = await analysisApi[action](
          layer.session_id,
          layer.output_id,
        );
        client.setQueryData(analysisKeys.map(layer.session_id), value);
        if (action === "select") onSelect();
      } else if (action === "remove")
        await analysisApi.removeLayer(layer.session_id, layer);
      else
        await analysisApi.style(layer.session_id, layer, {
          visible: action === "visibility" ? !layer.visible : layer.visible,
          opacity:
            action === "opacity" && opacity !== null ? opacity : layer.opacity,
          position:
            action === "up"
              ? layer.position + 1
              : action === "down"
                ? layer.position - 1
                : layer.position,
        });
    },
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: analysisKeys.layers(layer.session_id),
      });
      setOpacity(null);
    },
    onError: (error) => {
      console.error("[map] Updating a layer failed.", {
        layerId: layer.id,
        error,
      });
      void client.invalidateQueries({
        queryKey: analysisKeys.layers(layer.session_id),
      });
      setOpacity(null);
    },
  });
  return (
    <section
      className={`space-y-2 rounded-lg border p-2 ${selected ? "border-primary/50 bg-accent/30" : "border-border"}`}
    >
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          className="size-7"
          variant="ghost"
          disabled={mutation.isPending}
          aria-label={content.show}
          aria-pressed={layer.visible}
          onClick={() => mutation.mutate("visibility")}
        >
          {layer.visible ? (
            <Eye className="size-3.5" />
          ) : (
            <EyeOff className="size-3.5" />
          )}
        </Button>
        <button
          className="min-w-0 flex-1 truncate text-left text-xs font-medium"
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("select")}
        >
          {layer.title}
        </button>
        <Button
          size="icon"
          className="size-7"
          variant="ghost"
          aria-label={content.focus}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("focus")}
        >
          <LocateFixed className="size-3.5" />
        </Button>
        <Button
          size="icon"
          className="size-7"
          variant="ghost"
          aria-label={content.remove}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("remove")}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted-foreground">
          {content.opacity}
          <input
            aria-label={content.opacity}
            type="range"
            className="min-w-0 flex-1 accent-primary"
            min="0"
            max="1"
            step="0.05"
            value={opacity ?? layer.opacity}
            disabled={mutation.isPending}
            onChange={(event) => setOpacity(Number(event.target.value))}
            onPointerUp={() => mutation.mutate("opacity")}
            onKeyUp={(event) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "Home",
                  "End",
                  "ArrowUp",
                  "ArrowDown",
                ].includes(event.key)
              )
                mutation.mutate("opacity");
            }}
          />
          <span>{Math.round((opacity ?? layer.opacity) * 100)}%</span>
        </label>
        <Button
          size="icon"
          className="size-6"
          variant="ghost"
          aria-label={content.moveUp}
          disabled={mutation.isPending || layer.position === count - 1}
          onClick={() => mutation.mutate("up")}
        >
          <ArrowUp className="size-3" />
        </Button>
        <Button
          size="icon"
          className="size-6"
          variant="ghost"
          aria-label={content.moveDown}
          disabled={mutation.isPending || layer.position === 0}
          onClick={() => mutation.mutate("down")}
        >
          <ArrowDown className="size-3" />
        </Button>
      </div>
      {mutation.isError && (
        <p className="text-xs text-destructive" role="alert">
          {content.actionFailed}
        </p>
      )}
    </section>
  );
}
