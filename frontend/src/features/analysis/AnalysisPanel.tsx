import { useAppUiStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import {
  analysisApi,
  analysisKeys,
  type MapLayer,
} from "@/features/analysis/api";
import { LayerRow, type LayerMutation } from "@/features/analysis/MapLayerRows";
import { RasterViewSelector } from "@/features/analysis/RasterViewSelector";
import { referenceLayer } from "@/features/analysis/result-reference";
import type { LayerStatus } from "@/features/maps/analysis/useMapStatus";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { Layers, X } from "lucide-vue-next";
import {
  computed,
  defineComponent,
  reactive,
  shallowRef,
  shallowRef as sortingRef,
  toRef as sortingValue,
  watch,
} from "vue";
import { useDraggable } from "vue-draggable-plus";
const content = zhCN.analysis;
export const AnalysisPanel = defineComponent(
  (
    componentProps: {
      readonly sessionId: string;
      readonly layers: readonly MapLayer[];
      readonly error: boolean;
      readonly statuses: readonly LayerStatus[];
    },
    { slots: _slots },
  ) => {
    const sessionId = computed(() => componentProps.sessionId),
      layers = computed(() => componentProps.layers),
      error = computed(() => componentProps.error),
      statuses = computed(() => componentProps.statuses);
    const open = shallowRef(true),
      setOpen = refSetter(open);
    const session = useSessionWorkspace();
    const outputs = reactive(
      useQuery(
        computed(() => ({
          queryKey: analysisKeys.outputs(session.workspace_id),
          queryFn: () => analysisApi.outputs(session.workspace_id),
        })),
      ),
    );
    const referenceError = shallowRef<string | null>(null),
      setReferenceError = refSetter(referenceError);
    const inspectedLayerId = computed(() =>
      ((state) => state.mapExpandedLayerBySession[sessionId.value])(
        useAppUiStore(),
      ),
    );
    const client = useQueryClient();
    const mutation = reactive(
      useMutation({
        mutationFn: async ({
          layer,
          action,
        }: {
          layer: MapLayer;
          action: LayerMutation;
        }) => {
          if (action.kind === "remove") {
            await analysisApi.removeLayer(sessionId.value, layer);
          } else {
            await analysisApi.style(
              sessionId.value,
              layer,
              action.kind === "reorder"
                ? {
                    position: action.position,
                  }
                : action.kind === "opacity"
                  ? {
                      opacity: action.value,
                    }
                  : {
                      visible: !layer.visible,
                    },
            );
          }
        },
        onError: (reason) =>
          console.error("[map] Updating a layer failed.", {
            sessionId: sessionId.value,
            reason,
          }),
        onSettled: () =>
          client.invalidateQueries({
            queryKey: analysisKeys.layers(sessionId.value),
          }),
      }),
    );
    const ordered = computed(() =>
      [...layers.value].sort((left, right) => right.position - left.position),
    );
    const sortContainer = sortingRef<HTMLElement | null>(null);
    const sortItems = sortingRef([...ordered.value]);
    watch(ordered, (value) => {
      sortItems.value = [...value];
    });
    const sorting = useDraggable(sortContainer, sortItems, {
      immediate: false,
      handle: "[data-sort-handle]",
      animation: 180,
      direction: "vertical",
      disabled: mutation.isPending,
      onEnd: (event) => {
        if (
          event.oldIndex === undefined ||
          event.newIndex === undefined ||
          event.oldIndex === event.newIndex
        )
          return;
        const layer = ordered.value[event.oldIndex],
          target = ordered.value[event.newIndex];
        if (layer && target)
          mutation.mutate({
            layer,
            action: {
              kind: "reorder",
              position: target.position,
            },
          });
      },
    });
    watch(
      sortingValue(() => mutation.isPending),
      (value) => sorting.option("disabled", value),
    );
    watch(
      sortContainer,
      (element) => {
        sorting.destroy();
        if (element !== null) sorting.start(element);
      },
      { flush: "post" },
    );
    function moveByKey(event: KeyboardEvent) {
      if (
        !(event.target instanceof HTMLElement) ||
        !event.target.closest("[data-sort-handle]")
      )
        return;
      if (mutation.isPending || !["ArrowUp", "ArrowDown"].includes(event.key))
        return;
      const row = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-sort-id]",
      );
      const from = ordered.value.findIndex(
        (item) => item.id === row?.dataset.sortId,
      );
      const target = ordered.value[from + (event.key === "ArrowUp" ? -1 : 1)];
      const layer = ordered.value[from];
      if (layer && target) {
        event.preventDefault();
        mutation.mutate({
          layer,
          action: {
            kind: "reorder",
            position: target.position,
          },
        });
      }
    }
    return () => {
      const _layers = layers.value,
        _error = error.value,
        _sessionId = sessionId.value,
        _statuses = statuses.value,
        _inspectedLayerId = inspectedLayerId.value,
        _ordered = ordered.value;
      return (
        <aside
          class="flex min-h-0 shrink flex-col overflow-hidden rounded-xl border border-border bg-background/95 backdrop-blur"
          aria-label={content.title}
        >
          <div class="flex shrink-0 items-center justify-between px-3 py-2">
            <button
              type="button"
              class="flex items-center gap-2 text-sm font-medium"
              aria-expanded={open.value}
              onClick={() => setOpen((value) => !value)}
            >
              <Layers class="size-4" />
              {content.title}
              <span class="text-xs font-normal text-muted-foreground">
                {_layers.length}
              </span>
            </button>
            <Button
              size="icon"
              variant="ghost"
              class="size-7"
              aria-label={open.value ? content.close : content.open}
              onClick={() => setOpen((value) => !value)}
            >
              <X class={`size-3.5 ${open.value ? "" : "rotate-45"}`} />
            </Button>
          </div>
          {open.value && (
            <div class="min-h-0 space-y-1 overflow-y-auto border-t border-border/60 p-1.5">
              {(_error ||
                mutation.isError ||
                referenceError.value !== null ||
                outputs.isError) && (
                <div role="alert" class="text-xs text-destructive">
                  {referenceError.value ??
                    (_error || outputs.isError
                      ? content.loadFailed
                      : content.actionFailed)}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void Promise.all([
                        client.invalidateQueries({
                          queryKey: analysisKeys.layers(_sessionId),
                        }),
                        client.invalidateQueries({
                          queryKey: ["map-layer-preview", _sessionId],
                        }),
                      ])
                    }
                  >
                    {content.refresh}
                  </Button>
                </div>
              )}
              {_layers.length === 0 && (
                <p class="py-3 text-xs text-muted-foreground">
                  {content.emptyLayers}
                </p>
              )}
              <>
                <div ref={sortContainer} onKeydown={moveByKey}>
                  {sortItems.value.map((layer) => (
                    <LayerRow
                      sessionId={_sessionId}
                      key={layer.id}
                      layer={layer}
                      metadata={
                        outputs.data?.find(
                          (output) => output.id === layer.output_id,
                        )?.metadata
                      }
                      status={_statuses.find(
                        (value) => value.layer_id === layer.id,
                      )}
                      selected={layer.id === _inspectedLayerId}
                      disabled={mutation.isPending}
                      onInspect={() =>
                        useAppUiStore().inspectMapLayer(
                          _sessionId,
                          _inspectedLayerId === layer.id ? null : layer.id,
                        )
                      }
                      onAction={(action) => {
                        if (action.kind === "focus") {
                          if (layer.bounds !== null)
                            useAppUiStore().focusMap(_sessionId, layer.bounds);
                        } else if (action.kind === "reference") {
                          try {
                            referenceLayer(
                              _sessionId,
                              layer,
                              outputs.data ?? [],
                            );
                            setReferenceError(null);
                          } catch (reason) {
                            console.error(
                              "[map] Referencing layer failed",
                              reason,
                            );
                            setReferenceError(
                              reason instanceof Error
                                ? reason.message
                                : content.actionFailed,
                            );
                          }
                        } else
                          mutation.mutate({
                            layer,
                            action,
                          });
                      }}
                    />
                  ))}
                </div>
              </>
            </div>
          )}
          {open.value && (
            <RasterViewSelector
              sessionId={_sessionId}
              layer={
                _ordered.find((layer) => layer.id === _inspectedLayerId) ??
                _ordered.find((layer) => layer.visible)
              }
              outputs={outputs.data ?? []}
            />
          )}
        </aside>
      );
    };
  },
  {
    name: "AnalysisPanel",
    inheritAttrs: false,
    props: ["sessionId", "layers", "error", "statuses"],
  },
);
