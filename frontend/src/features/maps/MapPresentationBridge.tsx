import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { sessionMapPath } from "@/features/sessions/routes";
import { useAppUiStore } from "@/app/store";
import { useMapState } from "./usePersistentMap";

export function MapPresentationBridge() {
  const { events, records, replayCursor } = useSessionEvents();
  const session = useSessionWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const handled = useRef(new Set<string>());
  const hydratedSession = useRef<string | null>(null);
  const map = useMapState(session.id);
  useEffect(() => {
    if (map.data === undefined) return;
    const store = useAppUiStore.getState();
    store.initializeMapContext(session.id, session.workspace_id);
    if (hydratedSession.current !== session.id) {
      store.setMapView(session.id, map.data.viewport, map.data.camera);
      hydratedSession.current = session.id;
    }
    store.setMapImageSelection(
      session.id,
      map.data.candidate_set_id === null || map.data.selected_image_id === null
        ? null
        : {
            candidateSetId: map.data.candidate_set_id,
            imageId: map.data.selected_image_id,
          },
    );
  }, [session.id, session.workspace_id, map.data]);
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
        typeof request.open_map !== "boolean"
      )
        throw new Error("Invalid map presentation request.");
      if (handled.current.has(request.request_id)) continue;
      handled.current.add(request.request_id);
      if (
        request.open_map &&
        location.pathname !== sessionMapPath(session.workspace_id, session.id)
      )
        void navigate(sessionMapPath(session.workspace_id, session.id));
    }
  }, [events, records, replayCursor, session, navigate, location.pathname]);
  return null;
}
