import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { MapInteraction } from "@/features/maps/analysis/MapInteractions";
import { MAP_DIMENSIONS } from "@/features/maps/runtime/config";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { zhCN } from "@/locales/zh-CN";
import { interactionCopy } from "@/locales/zh-CN/map-interactions";
import {
  Compass,
  Crosshair,
  LocateFixed,
  Minus,
  MousePointer2,
  Plus,
  SquareDashed,
  SquareSplitHorizontal,
} from "lucide-vue-next";
import { computed, defineComponent } from "vue";
const content = zhCN.map;
export const MapToolbar = defineComponent(
  (
    componentProps: {
      readonly map: ReturnType<typeof useSessionMap>;
      readonly mode: MapInteraction["mode"] | null;
      readonly onInteract: (mode: MapInteraction["mode"]) => void;
      readonly onFitLayers: () => void;
      readonly hasLayers: boolean;
    },
    { slots: _slots },
  ) => {
    const map = computed(() => componentProps.map),
      mode = computed(() => componentProps.mode),
      onInteract = computed(() => componentProps.onInteract),
      onFitLayers = computed(() => componentProps.onFitLayers),
      hasLayers = computed(() => componentProps.hasLayers);
    const actions = computed(() => [
      {
        label: content.zoomIn,
        Icon: Plus,
        onClick: map.value.zoomIn,
      },
      {
        label: content.zoomOut,
        Icon: Minus,
        onClick: map.value.zoomOut,
      },
      {
        label: content.resetNorth,
        Icon: Compass,
        onClick: map.value.resetNorth,
      },
      {
        label: content.resetView,
        Icon: LocateFixed,
        onClick: onFitLayers.value,
        disabled: !hasLayers.value,
      },
    ]);
    return () => {
      const _map = map.value,
        _mode = mode.value,
        _onInteract = onInteract.value,
        _actions = actions.value;
      return (
        <div
          class="absolute top-4 right-4 z-10 flex flex-col items-end gap-2"
          role="toolbar"
          aria-label={content.controls}
        >
          <div
            class="flex gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-sm backdrop-blur"
            role="group"
            aria-label={content.dimension}
          >
            {MAP_DIMENSIONS.map((dimension) => (
              <Button
                key={dimension}
                variant={_map.dimension === dimension ? "default" : "ghost"}
                size="sm"
                disabled={!_map.ready}
                aria-pressed={_map.dimension === dimension}
                onClick={() => _map.changeDimension(dimension)}
              >
                {dimension === "2d"
                  ? content.twoDimensional
                  : content.threeDimensional}
              </Button>
            ))}
          </div>
          <div class="flex flex-col gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-sm backdrop-blur">
            {(
              [
                {
                  value: "pixel",
                  Icon: _mode === "pixel" ? Crosshair : MousePointer2,
                },
                {
                  value: "region",
                  Icon: SquareDashed,
                },
                {
                  value: "compare",
                  Icon: SquareSplitHorizontal,
                },
              ] as const
            ).map(({ value, Icon }) => (
              <Tooltip
                key={value}
                label={
                  value === "pixel"
                    ? _mode === "pixel"
                      ? interactionCopy.pointer
                      : interactionCopy.selectPoint
                    : interactionCopy[value]
                }
                side="left"
              >
                <Button
                  variant={_mode === value ? "default" : "ghost"}
                  size="icon"
                  class="size-8"
                  disabled={!_map.ready}
                  aria-label={
                    value === "pixel"
                      ? _mode === "pixel"
                        ? interactionCopy.pointer
                        : interactionCopy.selectPoint
                      : interactionCopy[value]
                  }
                  aria-pressed={_mode === value}
                  onClick={() => _onInteract(value)}
                >
                  <Icon class="size-4" strokeWidth={1.8} aria-hidden="true" />
                </Button>
              </Tooltip>
            ))}
          </div>
          <div class="flex flex-col gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-sm backdrop-blur">
            {_actions.map(({ label, Icon, onClick, disabled }) => (
              <Tooltip key={label} label={label} side="left">
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8"
                  disabled={!_map.ready || disabled}
                  aria-label={label}
                  onClick={onClick}
                >
                  <Icon class="size-4" strokeWidth={1.8} aria-hidden="true" />
                </Button>
              </Tooltip>
            ))}
          </div>
        </div>
      );
    };
  },
  {
    name: "MapToolbar",
    inheritAttrs: false,
    props: ["map", "mode", "onInteract", "onFitLayers", "hasLayers"],
  },
);
