import { MapProductSelector } from "@/features/analysis/MapProductSelector";
import { Button } from "@/components/ui/button";
import { useAppUiStore } from "@/app/store";
import {
  analysisApi,
  analysisKeys,
  type MapLayer,
} from "@/features/analysis/api";
import { LayerRow, type LayerMutation } from "@/features/analysis/MapLayerRows";
import { zhCN } from "@/locales/zh-CN";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { referenceLayer } from "@/features/analysis/result-reference";
import type { LayerStatus } from "@/features/maps/analysis/useMapStatus";
import { Layers, X } from "lucide-react";
import { useState } from "react";

const content = zhCN.analysis;
export function AnalysisPanel({
  sessionId,
  layers,
  error,
  statuses,
}: {
  readonly sessionId: string;
  readonly layers: readonly MapLayer[];
  readonly error: boolean;
  readonly statuses: readonly LayerStatus[];
}) {
  const [open, setOpen] = useState(true);
  const session = useSessionWorkspace();
  const outputs = useQuery({
    queryKey: analysisKeys.outputs(session.workspace_id),
    queryFn: () => analysisApi.outputs(session.workspace_id),
  });
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const inspectedLayerId = useAppUiStore(
    (state) => state.mapExpandedLayerBySession[sessionId],
  );
  const client = useQueryClient();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const mutation = useMutation({
    mutationFn: async ({
      layer,
      action,
    }: {
      layer: MapLayer;
      action: LayerMutation;
    }) => {
      if (action.kind === "remove") {
        await analysisApi.removeLayer(sessionId, layer);
      } else {
        await analysisApi.style(
          sessionId,
          layer,
          action.kind === "reorder"
            ? { position: action.position }
            : action.kind === "opacity"
              ? { opacity: action.value }
              : { visible: !layer.visible },
        );
      }
    },
    onError: (reason) =>
      console.error("[map] Updating a layer failed.", { sessionId, reason }),
    onSettled: () =>
      client.invalidateQueries({ queryKey: analysisKeys.layers(sessionId) }),
  });
  const ordered = [...layers].sort(
    (left, right) => right.position - left.position,
  );
  function reorder({ active, over }: DragEndEvent) {
    if (over === null || active.id === over.id || mutation.isPending) return;
    const layer = layers.find((item) => item.id === active.id);
    const target = layers.find((item) => item.id === over.id);
    if (layer === undefined || target === undefined)
      throw new Error("Dragged layers must exist in the current stack.");
    mutation.mutate({
      layer,
      action: { kind: "reorder", position: target.position },
    });
  }
  return (
    <aside
      className="flex min-h-0 shrink flex-col overflow-hidden rounded-xl border border-border bg-background/95 backdrop-blur"
      aria-label={content.title}
    >
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Layers className="size-4" />
          {content.title}
          <span className="text-xs font-normal text-muted-foreground">
            {layers.length}
          </span>
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={open ? content.close : content.open}
          onClick={() => setOpen((value) => !value)}
        >
          <X className={`size-3.5 ${open ? "" : "rotate-45"}`} />
        </Button>
      </div>
      {open && (
        <div className="min-h-0 space-y-1 overflow-y-auto border-t border-border/60 p-1.5">
          {(error ||
            mutation.isError ||
            referenceError !== null ||
            outputs.isError) && (
            <div role="alert" className="text-xs text-destructive">
              {referenceError ??
                (error || outputs.isError
                  ? content.loadFailed
                  : content.actionFailed)}
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void Promise.all([
                    client.invalidateQueries({
                      queryKey: analysisKeys.layers(sessionId),
                    }),
                    client.invalidateQueries({
                      queryKey: ["map-layer-preview", sessionId],
                    }),
                  ])
                }
              >
                {content.refresh}
              </Button>
            </div>
          )}
          {layers.length === 0 && (
            <p className="py-3 text-xs text-muted-foreground">
              {content.emptyLayers}
            </p>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={reorder}
          >
            <SortableContext
              items={ordered.map((layer) => layer.id)}
              strategy={verticalListSortingStrategy}
            >
              {ordered.map((layer) => (
                <LayerRow
                  sessionId={sessionId}
                  key={layer.id}
                  layer={layer}
                  metadata={
                    outputs.data?.find(
                      (output) => output.id === layer.output_id,
                    )?.metadata
                  }
                  status={statuses.find((value) => value.layer_id === layer.id)}
                  selected={layer.id === inspectedLayerId}
                  disabled={mutation.isPending}
                  onInspect={() =>
                    useAppUiStore
                      .getState()
                      .inspectMapLayer(
                        sessionId,
                        inspectedLayerId === layer.id ? null : layer.id,
                      )
                  }
                  onAction={(action) => {
                    if (action.kind === "focus") {
                      if (layer.bounds !== null)
                        useAppUiStore
                          .getState()
                          .focusMap(sessionId, layer.bounds);
                    } else if (action.kind === "reference") {
                      try {
                        referenceLayer(sessionId, layer, outputs.data ?? []);
                        setReferenceError(null);
                      } catch (reason) {
                        console.error("[map] Referencing layer failed", reason);
                        setReferenceError(
                          reason instanceof Error
                            ? reason.message
                            : content.actionFailed,
                        );
                      }
                    } else mutation.mutate({ layer, action });
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
      {open && (
        <MapProductSelector
          sessionId={sessionId}
          layer={
            ordered.find(
              (layer) => layer.id === inspectedLayerId && layer.visible,
            ) ?? ordered.find((layer) => layer.visible)
          }
          outputs={outputs.data ?? []}
        />
      )}
    </aside>
  );
}
