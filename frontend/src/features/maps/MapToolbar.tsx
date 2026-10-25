import {
  Compass,
  LocateFixed,
  MousePointer2,
  Crosshair,
  Minus,
  Plus,
  SquareDashed,
  SquareSplitHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { MAP_DIMENSIONS } from "@/features/maps/runtime/config";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { zhCN } from "@/locales/zh-CN";
import type { MapInteraction } from "@/features/maps/analysis/MapInteractions";
import { interactionCopy } from "@/locales/zh-CN/map-interactions";

const content = zhCN.map;

export function MapToolbar({
  map,
  mode,
  onInteract,
  onFitLayers,
  hasLayers,
}: {
  readonly map: ReturnType<typeof useSessionMap>;
  readonly mode: MapInteraction["mode"] | null;
  readonly onInteract: (mode: MapInteraction["mode"]) => void;
  readonly onFitLayers: () => void;
  readonly hasLayers: boolean;
}) {
  const actions = [
    { label: content.zoomIn, Icon: Plus, onClick: map.zoomIn },
    { label: content.zoomOut, Icon: Minus, onClick: map.zoomOut },
    { label: content.resetNorth, Icon: Compass, onClick: map.resetNorth },
    {
      label: content.resetView,
      Icon: LocateFixed,
      onClick: onFitLayers,
      disabled: !hasLayers,
    },
  ];

  return (
    <div
      className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2"
      role="toolbar"
      aria-label={content.controls}
    >
      <div
        className="flex gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-sm backdrop-blur"
        role="group"
        aria-label={content.dimension}
      >
        {MAP_DIMENSIONS.map((dimension) => (
          <Button
            key={dimension}
            variant={map.dimension === dimension ? "default" : "ghost"}
            size="sm"
            disabled={!map.ready}
            aria-pressed={map.dimension === dimension}
            onClick={() => map.changeDimension(dimension)}
          >
            {dimension === "2d"
              ? content.twoDimensional
              : content.threeDimensional}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-sm backdrop-blur">
        {(
          [
            {
              value: "pixel",
              Icon: mode === "pixel" ? Crosshair : MousePointer2,
            },
            { value: "region", Icon: SquareDashed },
            { value: "compare", Icon: SquareSplitHorizontal },
          ] as const
        ).map(({ value, Icon }) => (
          <Tooltip
            key={value}
            label={
              value === "pixel"
                ? mode === "pixel"
                  ? interactionCopy.pointer
                  : interactionCopy.selectPoint
                : interactionCopy[value]
            }
            side="left"
          >
            <Button
              variant={mode === value ? "default" : "ghost"}
              size="icon"
              className="size-8"
              disabled={!map.ready}
              aria-label={
                value === "pixel"
                  ? mode === "pixel"
                    ? interactionCopy.pointer
                    : interactionCopy.selectPoint
                  : interactionCopy[value]
              }
              aria-pressed={mode === value}
              onClick={() => onInteract(value)}
            >
              <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
            </Button>
          </Tooltip>
        ))}
      </div>
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-sm backdrop-blur">
        {actions.map(({ label, Icon, onClick, disabled }) => (
          <Tooltip key={label} label={label} side="left">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={!map.ready || disabled}
              aria-label={label}
              onClick={onClick}
            >
              <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
            </Button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
