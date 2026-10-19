import { useAppUiStore } from "@/app/store";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { sessionMapPath } from "@/features/sessions/routes";
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
        !("presentation" in result)
      )
        throw new Error("Invalid map presentation result.");
      const request = result.presentation;
      if (
        typeof request !== "object" ||
        request === null ||
        !("request_id" in request) ||
        typeof request.request_id !== "string" ||
        !("open_map" in request) ||
        typeof request.open_map !== "boolean" ||
        !("focus" in request) || typeof request.focus !== "boolean" ||
        !("bounds" in request) || (request.bounds !== null && (!Array.isArray(request.bounds) || request.bounds.length !== 4 || !request.bounds.every(value => typeof value === "number" && Number.isFinite(value))))
      )
        throw new Error("Invalid map presentation request.");
      if (handled.current.has(request.request_id)) continue;
      handled.current.add(request.request_id);
      if (request.focus && request.bounds !== null)
        useAppUiStore.getState().focusMap(session.id, [request.bounds[0], request.bounds[1], request.bounds[2], request.bounds[3]]);
      if (
        request.open_map &&
        location.pathname !== sessionMapPath(session.workspace_id, session.id)
      )
        void navigate(sessionMapPath(session.workspace_id, session.id));
    }
  }, [events, records, replayCursor, session, navigate, location.pathname]);
  return null;
}
