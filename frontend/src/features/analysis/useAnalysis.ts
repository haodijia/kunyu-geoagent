import { analysisApi, analysisKeys } from "@/features/analysis/api";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

export function useAnalysisInvalidation(
  sessionId: string,
  workspaceId: string,
) {
  const { events } = useSessionEvents();
  const client = useQueryClient();
  const cursor = useRef(0);
  useEffect(() => {
    const incoming = events.filter((event) => event.sequence > cursor.current);
    for (const event of incoming) {
      cursor.current = event.sequence;
      if (event.event_type === "analysis/output") {
        void client.invalidateQueries({
          queryKey: analysisKeys.outputs(workspaceId),
        });
        void client.invalidateQueries({
          queryKey: ["analysis", "workspaces", workspaceId, "output"],
        });
      }
      if (event.event_type === "map/changed") {
        void client.invalidateQueries({
          queryKey: analysisKeys.layers(sessionId),
        });
      }
    }
  }, [client, events, sessionId, workspaceId]);
}

export function useAnalysisOutputs(workspaceId: string) {
  return useQuery({
    queryKey: analysisKeys.outputs(workspaceId),
    queryFn: () => analysisApi.outputs(workspaceId),
  });
}
