import { Compass, LocateFixed, Minus, Plus, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { MAP_DIMENSIONS } from "@/features/maps/runtime/config";
import type { useSessionMap } from "@/features/maps/runtime/useSessionMap";
import { zhCN } from "@/locales/zh-CN";
import { assessmentCopy } from "@/locales/zh-CN/assessments";

const content = zhCN.map;

export function MapToolbar({
  map,
  analysisOpen,
  onAnalysis,
}: {
  readonly map: ReturnType<typeof useSessionMap>;
  readonly analysisOpen: boolean;
  readonly onAnalysis: () => void;
}) {
  const actions = [
    { label: content.zoomIn, Icon: Plus, onClick: map.zoomIn },
    { label: content.zoomOut, Icon: Minus, onClick: map.zoomOut },
    { label: content.resetNorth, Icon: Compass, onClick: map.resetNorth },
    { label: content.resetView, Icon: LocateFixed, onClick: map.resetView },
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
        <Tooltip label={assessmentCopy.open} side="left">
          <Button
            variant={analysisOpen ? "secondary" : "ghost"}
            size="icon"
            className="size-8"
            aria-label={assessmentCopy.open}
            aria-pressed={analysisOpen}
            onClick={onAnalysis}
          >
            <ScanLine className="size-4" />
          </Button>
        </Tooltip>
        {actions.map(({ label, Icon, onClick }) => (
          <Tooltip key={label} label={label} side="left">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={!map.ready}
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
