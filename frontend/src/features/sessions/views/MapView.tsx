import { useAppUiStore } from "@/app/store";
import { Button } from "@/components/ui/button";
import { AgentControls } from "@/features/agent/controls/AgentControls";
import { AnalysisPanel } from "@/features/analysis/AnalysisPanel";
import { analysisApi, analysisKeys } from "@/features/analysis/api";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { MapToolbar } from "@/features/maps/MapToolbar";
import type { ComparisonCapture } from "@/features/maps/analysis/MapComparison";
import { MapComparison } from "@/features/maps/analysis/MapComparison";
import {
  MapInteractions,
  type MapInteraction,
} from "@/features/maps/analysis/MapInteractions";
import { ObjectReviewPanel } from "@/features/maps/analysis/ObjectReviewPanel";
import { captureComparedMap } from "@/features/maps/analysis/comparison-capture";
import { latestObjectReview } from "@/features/maps/analysis/object-review";
import { useSelectionOverlay } from "@/features/maps/analysis/useMapDrawing";
import { useMapStatus } from "@/features/maps/analysis/useMapStatus";
import { MapConversation } from "@/features/maps/conversation/MapConversation";
import { MapLayers } from "@/features/maps/layers/MapLayers";
import "@/features/maps/map.css";
import {
  MapCaptureError,
  registerMapCapture,
} from "@/features/maps/runtime/map-capture";
import { useMapFocus } from "@/features/maps/runtime/useMapFocus";
import { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { SessionComposer } from "@/features/messages/composer/SessionComposer";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { objectReview } from "@/locales/zh-CN/object-review";
import { useQuery } from "@tanstack/vue-query";
import { AlertCircle, LoaderCircle } from "lucide-vue-next";
import "maplibre-gl/dist/maplibre-gl.css";
import { computed, defineComponent, reactive, shallowRef } from "vue";
const content = zhCN.map;
export const MapView = defineComponent(
  (_props, { slots: _slots }) => {
    const session = useSessionWorkspace();
    return () => {
      return <MapCanvas key={session.id} />;
    };
  },
  {
    name: "MapView",
    inheritAttrs: false,
    props: [],
  },
);
const MapCanvas = defineComponent(
  (_props, { slots: _slots }) => {
    const targetRef = shallowRef<HTMLDivElement | null>(null);
    const overlayRef = shallowRef<HTMLDivElement | null>(null);
    const session = useSessionWorkspace();
    const map = useSessionMap(
      targetRef,
      overlayRef,
      () => session.id,
      () => session.workspace_id,
    );
    const interaction = shallowRef<MapInteraction | null>(null),
      setInteraction = refSetter(interaction);
    const pair = computed(() =>
      ((state) => state.mapComparisonBySession[session.id] ?? null)(
        useAppUiStore(),
      ),
    );
    const selectedLayerId = computed(() =>
      ((state) => state.mapExpandedLayerBySession[session.id])(useAppUiStore()),
    );
    const selection = computed(() =>
      ((state) => state.mapContextBySession[session.id]?.selection)(
        useAppUiStore(),
      ),
    );
    useSelectionOverlay(
      () => map.getMap(),
      () => map.ready,
      () => selection.value?.geometry ?? null,
    );
    const setPair = (value: readonly [string, string] | null) => {
      useAppUiStore().setMapComparison(session.id, value);
    };
    const comparisonError = shallowRef<string | null>(null),
      setComparisonError = refSetter(comparisonError);
    const comparisonCapture = shallowRef<ComparisonCapture | null>(null);
    useMapFocus(
      () => session.id,
      () => map,
    );
    const layerQuery = reactive(
      useQuery(
        computed(() => ({
          queryKey: analysisKeys.layers(session.id),
          queryFn: () => analysisApi.layers(session.id),
        })),
      ),
    );
    const layers = computed(() => layerQuery.data ?? []);
    const outputs = reactive(
      useQuery(
        computed(() => ({
          queryKey: analysisKeys.outputs(session.workspace_id),
          queryFn: () => analysisApi.outputs(session.workspace_id),
        })),
      ),
    );
    watchMounted(
      [
        () => layers.value,
        () => pair.value,
        () => interaction.value,
        () => setPair,
        () => layerQuery.isPending,
      ],
      () => {
        if (
          pair.value !== null &&
          !layerQuery.isPending &&
          pair.value.some(
            (id) =>
              !layers.value.some(
                (layer) => layer.id === id && layer.bounds !== null,
              ),
          )
        )
          setPair(null);
        if (
          interaction.value !== null &&
          interaction.value.layerId !== null &&
          !layerQuery.isPending &&
          !layers.value.some((layer) => layer.id === interaction.value?.layerId)
        )
          setInteraction({
            ...interaction.value,
            layerId: null,
          });
      },
    );
    watchMounted([() => pair.value, () => layers.value], () => {
      if (
        pair.value !== null &&
        layers.value.some((layer) => layer.id === pair.value?.[0])
      )
        setInteraction({
          layerId: pair.value[0],
          mode: "compare",
        });
    });
    watchMounted(
      [() => interaction.value, () => setPair, () => session.id],
      () => {
        const cancel = (event: KeyboardEvent) => {
          if (
            event.key === "Escape" &&
            !(
              event.target instanceof HTMLElement &&
              (event.target as HTMLElement).closest(
                "input, textarea, [contenteditable=true]",
              )
            )
          ) {
            useAppUiStore().setMapSelection(session.id, null);
            setInteraction(null);
            setPair(null);
          }
        };
        window.addEventListener("keydown", cancel);
        return () => window.removeEventListener("keydown", cancel);
      },
    );
    const spatialLayers = computed(() =>
      layers.value
        .filter((layer) => layer.bounds !== null)
        .sort((a, b) => b.position - a.position),
    );
    const selectedLayer = computed(() =>
      spatialLayers.value.find((layer) => layer.id === selectedLayerId.value),
    );
    const targetLayer = computed(
      () =>
        selectedLayer.value ??
        spatialLayers.value.find((layer) => layer.visible),
    );
    const sessionEvents = useSessionEvents();
    const review = computed(() =>
      latestObjectReview(
        sessionEvents.records,
        new Set(
          layers.value.flatMap((layer) =>
            layer.output_id ? [layer.output_id] : [],
          ),
        ),
      ),
    );
    const collapsedReviewId = shallowRef<string | null>(null);
    const activeInteraction = computed<MapInteraction | null>(() =>
      interaction.value === null
        ? null
        : {
            ...interaction.value,
            layerId: targetLayer.value?.id ?? null,
          },
    );
    function toggleInteraction(mode: MapInteraction["mode"]) {
      setComparisonError(null);
      setPair(null);
      useAppUiStore().setMapSelection(session.id, null);
      if (interaction.value?.mode === mode) {
        setInteraction(null);
        return;
      }
      if (mode === "compare") {
        const visible = spatialLayers.value.filter((layer) => layer.visible);
        if (visible.length >= 2) {
          setPair([visible[1]!.id, visible[0]!.id]);
          setInteraction({
            layerId: visible[0]!.id,
            mode,
          });
          return;
        }
      }
      const eligible = spatialLayers.value.filter(
        (layer) => mode !== "pixel" || layer.output_id !== null,
      );
      const layer =
        eligible.find((layer) => layer.id === selectedLayerId.value) ??
        eligible[0];
      setInteraction({
        layerId: layer?.id ?? null,
        mode,
      });
    }
    watchMounted(
      [
        () => session.id,
        () => map,
        () => layerQuery.isPending,
        () => layerQuery.isError,
        () => layers.value,
        () => pair.value,
      ],
      () =>
        registerMapCapture(session.id, async () => {
          const instance = map.getMap();
          if (
            instance === null ||
            !map.ready ||
            map.failed ||
            layerQuery.isPending ||
            layerQuery.isError ||
            (pair.value !== null && comparisonCapture.value === null) ||
            layers.value.some(
              (layer) =>
                layer.visible && instance.getLayer(layer.id) === undefined,
            )
          ) {
            throw new MapCaptureError("MAP_NOT_READY", content.captureNotReady);
          }
          return captureComparedMap(instance, comparisonCapture.value);
        }),
    );
    const layerErrors = shallowRef<Readonly<Record<string, string>>>({}),
      setLayerErrors = refSetter(layerErrors);
    const layerError = (id: string, error: string | null) => {
      setLayerErrors((current) => {
        if (
          current[id] === error ||
          (current[id] === undefined && error === null)
        )
          return current;
        const next = {
          ...current,
        };
        if (error === null) delete next[id];
        else next[id] = error;
        return next;
      });
    };
    const rendering = useMapStatus(
      () => session.id,
      () => map,
      () => layers.value,
      () => layerErrors.value,
      comparisonCapture,
      () => pair.value,
    );
    const interactionContent = computed(
      () =>
        activeInteraction.value !== null && (
          <MapInteractions
            value={activeInteraction.value}
            map={map}
            workspaceId={session.workspace_id}
            sessionId={session.id}
            layers={layers.value}
            outputs={outputs.data ?? []}
            pair={pair.value}
            onPair={(value) => {
              setComparisonError(null);
              setPair(value);
            }}
            onClose={() => {
              setInteraction(null);
              setPair(null);
              useAppUiStore().setMapSelection(session.id, null);
            }}
          />
        ),
    );
    return () => {
      const _activeInteraction = activeInteraction.value,
        _spatialLayers = spatialLayers.value,
        _layers = layers.value,
        _pair = pair.value,
        _review = review.value,
        _interactionContent = interactionContent.value;
      return (
        <div
          class="kunyu-map chat-surface-container relative h-full overflow-hidden bg-muted"
          aria-label={content.label}
        >
          <div ref={targetRef} class="absolute inset-0" />
          <MapToolbar
            map={map}
            mode={_activeInteraction?.mode ?? null}
            onInteract={toggleInteraction}
            onFitLayers={() => {
              const bounds = _spatialLayers
                .filter((layer) => layer.visible)
                .map((layer) => layer.bounds!);
              if (bounds.length > 0)
                map.focusBounds([
                  Math.min(...bounds.map((b) => b[0])),
                  Math.min(...bounds.map((b) => b[1])),
                  Math.max(...bounds.map((b) => b[2])),
                  Math.max(...bounds.map((b) => b[3])),
                ]);
            }}
            hasLayers={_spatialLayers.some((layer) => layer.visible)}
          />
          <MapLayers
            map={map}
            workspaceId={session.workspace_id}
            layers={_layers}
            comparison={_pair}
            onError={layerError}
          />
          <div class="map-analysis-dock pointer-events-none absolute top-4 left-4 z-20 flex w-64 max-w-[calc(100%-8rem)] flex-col gap-2 [&>*]:pointer-events-auto">
            <AnalysisPanel
              sessionId={session.id}
              layers={_layers}
              error={
                layerQuery.isError ||
                outputs.isError ||
                Object.keys(layerErrors.value).length > 0
              }
              statuses={rendering.layers}
            />
            {_interactionContent}
            {_review !== null &&
              _activeInteraction === null &&
              (collapsedReviewId.value === _review.id ? (
                <Button
                  class="self-start"
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    collapsedReviewId.value = null;
                  }}
                >
                  {objectReview.open}
                </Button>
              ) : (
                <ObjectReviewPanel
                  key={_review.id}
                  report={_review.report}
                  onClose={() => {
                    collapsedReviewId.value = _review.id;
                  }}
                  onLocate={(item) =>
                    useAppUiStore().focusMap(session.id, item.bounds)
                  }
                />
              ))}
            {comparisonError.value !== null && (
              <div
                role="alert"
                class="rounded-lg border border-border bg-background p-3 text-xs text-destructive"
              >
                {comparisonError.value}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPair(null);
                    setComparisonError(null);
                  }}
                >
                  {content.closeComparison}
                </Button>
              </div>
            )}
          </div>
          {_pair !== null && (
            <MapComparison
              map={map}
              layers={_layers}
              pair={_pair}
              capture={comparisonCapture}
              onError={setComparisonError}
            />
          )}
          <div class="pointer-events-none absolute right-4 bottom-[calc(var(--map-overlay-height,180px)+3rem)] z-10 max-w-80 [&>*]:pointer-events-auto">
            {map.failed ? (
              <div
                class="rounded-xl border border-border bg-background/95 p-4 shadow-sm backdrop-blur"
                role="alert"
              >
                <div class="flex items-center gap-2 text-sm font-medium">
                  <AlertCircle
                    class="size-4 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  {content.loadFailed}
                </div>
                <p class="mt-2 text-xs leading-5 text-muted-foreground">
                  {content.loadFailedDescription}
                </p>
                <Button
                  class="mt-3"
                  variant="outline"
                  size="sm"
                  onClick={map.reload}
                >
                  {content.retry}
                </Button>
              </div>
            ) : map.loading ? (
              <div
                class="flex items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs text-secondary-foreground shadow-sm"
                role="status"
              >
                <LoaderCircle
                  class="size-3.5 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {content.loading}
              </div>
            ) : map.dimension === "3d" ? (
              <div class="rounded-lg border border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm">
                {content.terrainHint}
              </div>
            ) : null}
          </div>
          <div
            ref={overlayRef}
            class="map-composer-overlay pointer-events-none absolute z-10 [&>*]:pointer-events-auto"
          >
            <MapConversation />
            <AgentControls />
            <SessionComposer />
          </div>
        </div>
      );
    };
  },
  {
    name: "MapCanvas",
    inheritAttrs: false,
    props: [],
  },
);
