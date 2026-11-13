import { Button } from "@/components/ui/button";
import type { MapLayer } from "@/features/analysis/api";
import type { LayerStatus } from "@/features/maps/analysis/useMapStatus";
import { useLayerPreview } from "@/features/maps/layers/useLayerPreview";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import {
  Eye,
  EyeOff,
  GripVertical,
  ImageOff,
  LocateFixed,
  MessageSquarePlus,
  Trash2,
} from "lucide-vue-next";
import { computed, defineComponent, shallowRef } from "vue";
import type { RasterMetadata } from "./raster-views";
const content = zhCN.analysis;
export type LayerMutation =
  | {
      readonly kind: "visibility" | "remove";
    }
  | {
      readonly kind: "opacity";
      readonly value: number;
    }
  | {
      readonly kind: "reorder";
      readonly position: number;
    };
export type LayerAction =
  | LayerMutation
  | {
      readonly kind: "focus";
    }
  | {
      readonly kind: "reference";
    };
export const LayerRow = defineComponent(
  (
    componentProps: {
      readonly metadata: RasterMetadata | undefined;
      readonly sessionId: string;
      readonly layer: MapLayer;
      readonly selected: boolean;
      readonly disabled: boolean;
      readonly onInspect: () => void;
      readonly onAction: (action: LayerAction) => void;
      readonly status: LayerStatus | undefined;
    },
    { slots: _slots },
  ) => {
    const sessionId = computed(() => componentProps.sessionId),
      layer = computed(() => componentProps.layer),
      selected = computed(() => componentProps.selected),
      disabled = computed(() => componentProps.disabled),
      onInspect = computed(() => componentProps.onInspect),
      onAction = computed(() => componentProps.onAction),
      status = computed(() => componentProps.status),
      metadata = computed(() => componentProps.metadata);
    const view = computed(() =>
      metadata.value?.views.find((view) => view.id === layer.value.view_id),
    );
    const categories = computed(() =>
      view.value?.style.type === "classified" ? view.value.style.classes : [],
    );
    const opacity = shallowRef(layer.value.opacity),
      setOpacity = refSetter(opacity);
    watchMounted([() => layer.value.opacity, () => disabled.value], () => {
      if (!disabled.value) setOpacity(layer.value.opacity);
    });
    const image = useLayerPreview(
      () => sessionId.value,
      () => layer.value.id,
      () => true,
      () => layer.value.revision,
    );
    return () => {
      const _layer = layer.value,
        _selected = selected.value,
        _disabled = disabled.value,
        _onInspect = onInspect.value,
        _status = status.value,
        _onAction = onAction.value,
        _metadata = metadata.value,
        _categories = categories.value;
      return (
        <section
          data-sort-id={_layer.id}
          style={{ position: "relative" }}
          class={`group space-y-2 rounded-lg border p-2 transition-colors ${_selected ? "border-border bg-muted/60" : "border-transparent hover:bg-muted/40"}`}
        >
          <div class="flex items-center gap-2">
            <button
              type="button"
              disabled={_disabled}
              class="flex h-8 w-3 shrink-0 touch-none items-center justify-center rounded text-muted-foreground/50 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              aria-label={`${content.reorder} · ${_layer.title}`}
              data-sort-handle="true"
              title={content.reorder}
            >
              <GripVertical class="size-3.5" />
            </button>
            <button
              type="button"
              onClick={_onInspect}
              aria-label={_layer.title}
              aria-pressed={_selected}
              class="flex min-w-0 flex-1 items-center gap-2 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {image.url !== null ? (
                  <img
                    src={image.url}
                    alt={content.previewAlt}
                    class="size-full object-contain"
                  />
                ) : image.error ? (
                  <ImageOff
                    class="size-4 text-muted-foreground"
                    aria-label={content.previewFailed}
                  />
                ) : (
                  <span
                    class="size-5 animate-pulse rounded bg-border"
                    aria-label={content.loading}
                  />
                )}
              </span>
              <span class="min-w-0 space-y-1">
                <span
                  class="block line-clamp-2 text-xs font-medium"
                  title={_layer.title}
                >
                  {_layer.title}
                </span>
                {_layer.image !== null && (
                  <span class="block text-[11px] text-muted-foreground">
                    {_layer.image.resolution === null
                      ? zhCN.mapConversation.unknownResolution
                      : `${_layer.image.resolution}${content.metres}`}{" "}
                    ·{" "}
                    {_layer.image.cloud === null
                      ? content.unknownCloud
                      : zhCN.mapConversation.cloud(_layer.image.cloud)}
                  </span>
                )}
                {_layer.visible &&
                  _status !== undefined &&
                  _status.state !== "ready" && (
                    <span
                      class={`block text-[11px] ${_status.state === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {_status.state === "failed"
                        ? content.renderFailed
                        : content.renderLoading}
                    </span>
                  )}
                {_layer.bounds === null && (
                  <span class="block text-[11px] text-destructive">
                    {zhCN.mapConversation.noFootprint}
                  </span>
                )}
              </span>
            </button>
            <Button
              size="icon"
              class="size-6 shrink-0"
              variant="ghost"
              disabled={_disabled}
              aria-label={content.show}
              aria-pressed={_layer.visible}
              onClick={() =>
                _onAction({
                  kind: "visibility",
                })
              }
            >
              {_layer.visible ? (
                <Eye class="size-3.5" />
              ) : (
                <EyeOff class="size-3.5" />
              )}
            </Button>
          </div>
          {_selected && (
            <div class="flex items-center gap-1 pl-5">
              <label class="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-muted-foreground">
                <span class="sr-only">{content.opacity}</span>
                <input
                  aria-label={content.opacity}
                  type="range"
                  class="min-w-0 flex-1 accent-foreground"
                  min="0"
                  max="1"
                  step="0.05"
                  value={opacity.value}
                  disabled={_disabled}
                  onInput={(event) =>
                    setOpacity(Number((event.target as HTMLInputElement).value))
                  }
                  onPointercancel={() => setOpacity(_layer.opacity)}
                  onPointerup={() => {
                    if (opacity.value !== _layer.opacity)
                      _onAction({
                        kind: "opacity",
                        value: opacity.value,
                      });
                  }}
                  onKeyup={(event) => {
                    if (
                      [
                        "ArrowLeft",
                        "ArrowRight",
                        "Home",
                        "End",
                        "ArrowUp",
                        "ArrowDown",
                      ].includes(event.key) &&
                      opacity.value !== _layer.opacity
                    )
                      _onAction({
                        kind: "opacity",
                        value: opacity.value,
                      });
                  }}
                />
                <span class="w-8 text-right tabular-nums">
                  {Math.round(opacity.value * 100)}%
                </span>
              </label>
              <Button
                size="icon"
                class="size-6"
                variant="ghost"
                aria-label={content.continueQuestion}
                onClick={() =>
                  _onAction({
                    kind: "reference",
                  })
                }
              >
                <MessageSquarePlus class="size-3.5" />
              </Button>
              <Button
                size="icon"
                class="size-6"
                variant="ghost"
                aria-label={content.focus}
                disabled={_layer.bounds === null}
                onClick={() =>
                  _onAction({
                    kind: "focus",
                  })
                }
              >
                <LocateFixed class="size-3.5" />
              </Button>
              <Button
                size="icon"
                class="size-6"
                variant="ghost"
                aria-label={content.remove}
                disabled={_disabled}
                onClick={() =>
                  _onAction({
                    kind: "remove",
                  })
                }
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          )}
          {_selected && _metadata !== undefined && (
            <div class="flex flex-wrap gap-x-3 gap-y-1 pl-5 text-[10px] text-muted-foreground">
              {_categories.map((category) => (
                <span key={category.value} class="flex items-center gap-1">
                  <span
                    class="size-2 rounded-sm"
                    style={{
                      background: category.color,
                    }}
                  />
                  {category.label}
                </span>
              ))}
            </div>
          )}
        </section>
      );
    };
  },
  {
    name: "LayerRow",
    inheritAttrs: false,
    props: [
      "sessionId",
      "layer",
      "selected",
      "disabled",
      "onInspect",
      "onAction",
      "status",
      "metadata",
    ],
  },
);
