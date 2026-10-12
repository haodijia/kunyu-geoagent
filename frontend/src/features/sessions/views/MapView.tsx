import { AlertCircle, LoaderCircle } from "lucide-react";
import { useRef } from "react";

import "maplibre-gl/dist/maplibre-gl.css";
import "@/features/maps/map.css";

import { Button } from "@/components/ui/button";
import { AgentControls } from "@/features/agent/AgentControls";
import { MapToolbar } from "@/features/maps/MapToolbar";
import { useSessionMap } from "@/features/maps/useSessionMap";
import { SessionComposer } from "@/features/messages/SessionComposer";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.map;

export function MapView() {
  const targetRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const session = useSessionWorkspace();
  const map = useSessionMap(targetRef, overlayRef, session.id, session.workspace_id);

  return (
    <div className="kunyu-map chat-surface-container relative h-full overflow-hidden bg-muted" aria-label={content.label}>
      <div ref={targetRef} className="absolute inset-0" />
      <MapToolbar map={map} />
      <div className="absolute top-4 left-4 z-10 max-w-[min(24rem,calc(100%-9rem))]">
        {map.failed ? (
          <div className="rounded-xl border border-border bg-background/95 p-4 shadow-sm backdrop-blur" role="alert">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
              {content.loadFailed}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{content.loadFailedDescription}</p>
            <Button className="mt-3" variant="outline" size="sm" onClick={map.reload}>{content.retry}</Button>
          </div>
        ) : map.loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs text-secondary-foreground shadow-sm" role="status">
            <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {content.loading}
          </div>
        ) : map.dimension === "3d" ? (
          <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm">
            {content.terrainHint}
          </div>
        ) : null}
      </div>
      <div ref={overlayRef} className="pointer-events-none absolute right-0 bottom-0 left-0 z-10 [&>*]:pointer-events-auto">
        <AgentControls />
        <SessionComposer />
      </div>
    </div>
  );
}
