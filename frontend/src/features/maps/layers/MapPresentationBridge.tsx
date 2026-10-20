import { useAppUiStore } from "@/app/store";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { sessionMapPath } from "@/features/sessions/routes";
import type { MapBounds } from "@/features/sessions/map-context";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export function MapPresentationBridge() {
  const { events, records, replayCursor } = useSessionEvents();
  const session = useSessionWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const handled = useRef(new Set<string>());
  useEffect(() => {
    for (const event of events) {
      if (
        event.sequence <= replayCursor ||
        event.event_type !== "tool.completed"
      )
        continue;
      const call = records.find(
        (record) =>
          record.eventType === "tool.requested" &&
          record.payload.tool_call_id === event.payload.tool_call_id,
      );
      if (call?.payload.name !== "map_present") continue;
      const result = event.payload.result;
      if (
        typeof result !== "object" ||
        result === null ||
        !("layers" in result) ||
        !Array.isArray(result.layers) || result.layers.length === 0
      )
        throw new Error("Invalid map presentation result.");
      const arguments_ = call.payload.arguments;
      if (
        typeof arguments_ !== "object" || arguments_ === null ||
        !("open_map" in arguments_) || typeof arguments_.open_map !== "boolean" ||
        !("focus" in arguments_) || typeof arguments_.focus !== "boolean"
      )
        throw new Error("Invalid map presentation arguments.");
      let bounds: MapBounds | null = null;
      for (const layer of result.layers) {
        if (typeof layer !== "object" || layer === null || !("bounds" in layer))
          throw new Error("Invalid presented layer.");
        const extent = layer.bounds;
        if (extent === null) continue;
        if (!Array.isArray(extent) || extent.length !== 4 || !extent.every(value => typeof value === "number" && Number.isFinite(value)))
          throw new Error("Invalid presented layer bounds.");
        bounds = bounds === null ? [extent[0], extent[1], extent[2], extent[3]]
          : [Math.min(bounds[0], extent[0]), Math.min(bounds[1], extent[1]), Math.max(bounds[2], extent[2]), Math.max(bounds[3], extent[3])];
      }
      const toolId = event.payload.tool_call_id;
      if (typeof toolId !== "string") throw new Error("Invalid presentation tool identity.");
      if (handled.current.has(toolId)) continue;
      handled.current.add(toolId);
      if (arguments_.focus && bounds !== null)
        useAppUiStore.getState().focusMap(session.id, bounds);
      if (
        arguments_.open_map &&
        location.pathname !== sessionMapPath(session.workspace_id, session.id)
      )
        void navigate(sessionMapPath(session.workspace_id, session.id));
    }
  }, [events, records, replayCursor, session, navigate, location.pathname]);
  return null;
}
