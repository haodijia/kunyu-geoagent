import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";
import { analysisApi, analysisKeys, type MapLayer, type MapState } from "./api";
import { LayerRow, type LayerAction } from "./MapLayerRows";

const content = zhCN.analysis;
export function AnalysisPanel({ sessionId, state, layers, error }: {
  readonly sessionId: string;
  readonly state: MapState;
  readonly layers: readonly MapLayer[];
  readonly error: boolean;
}) {
  const [open, setOpen] = useState(true);
  const client = useQueryClient();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const mutation = useMutation({
    mutationFn: async ({ layer, action }: { layer: MapLayer; action: LayerAction }) => {
      if (action.kind === "select" || action.kind === "focus") {
        const value = await analysisApi[action.kind](sessionId, layer.output_id);
        client.setQueryData(analysisKeys.map(sessionId), value);
      } else if (action.kind === "remove") {
        await analysisApi.removeLayer(sessionId, layer);
      } else {
        await analysisApi.style(sessionId, layer, {
          visible: action.kind === "visibility" ? !layer.visible : layer.visible,
          opacity: action.kind === "opacity" ? action.value : layer.opacity,
          position: action.kind === "reorder" ? action.position : layer.position,
        });
      }
    },
    onError: (reason) => console.error("[map] Updating a layer failed.", { sessionId, reason }),
    onSettled: () => client.invalidateQueries({ queryKey: analysisKeys.layers(sessionId) }),
  });
  const ordered = [...layers].sort((left, right) => right.position - left.position);
  function reorder({ active, over }: DragEndEvent) {
    if (over === null || active.id === over.id || mutation.isPending) return;
    const layer = layers.find((item) => item.id === active.id);
    const target = layers.find((item) => item.id === over.id);
    if (layer === undefined || target === undefined) throw new Error("Dragged layers must exist in the current stack.");
    mutation.mutate({ layer, action: { kind: "reorder", position: target.position } });
  }
  return <aside
    className="absolute top-4 left-4 z-10 flex max-h-[calc(100%-var(--map-overlay-height,180px)-2rem)] w-80 max-w-[calc(100%-8rem)] flex-col rounded-xl border border-border bg-background/95 backdrop-blur"
    aria-label={content.title}
  >
    <div className="flex shrink-0 items-center justify-between px-3 py-2">
      <button type="button" className="flex items-center gap-2 text-sm font-medium" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Layers className="size-4" />{content.title}
        <span className="text-xs font-normal text-muted-foreground">{layers.length}</span>
      </button>
      <Button size="icon" variant="ghost" className="size-7" aria-label={open ? content.close : content.open} onClick={() => setOpen((value) => !value)}>
        <X className={`size-3.5 ${open ? "" : "rotate-45"}`} />
      </Button>
    </div>
    {open && <div className="min-h-0 space-y-2 overflow-y-auto border-t border-border p-3">
      {(error || mutation.isError) && <div role="alert" className="text-xs text-destructive">
        {error ? content.loadFailed : content.actionFailed}
        <Button size="sm" variant="ghost" onClick={() => void client.invalidateQueries({ queryKey: analysisKeys.layers(sessionId) })}>{content.refresh}</Button>
      </div>}
      {layers.length === 0 && <p className="py-3 text-xs text-muted-foreground">{content.emptyLayers}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
        <SortableContext items={ordered.map((layer) => layer.id)} strategy={verticalListSortingStrategy}>
          {ordered.map((layer) => <LayerRow
            key={`${layer.id}:${layer.revision}`}
            layer={layer}
            selected={layer.output_id === state.selected_output_id}
            disabled={mutation.isPending}
            onAction={(action) => mutation.mutate({ layer, action })}
          />)}
        </SortableContext>
      </DndContext>
    </div>}
  </aside>;
}
