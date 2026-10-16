import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { analysisApi, analysisKeys } from "./api";

export function useAnalysisInvalidation(sessionId: string, workspaceId: string) {
  const { events } = useSessionEvents();
  const client = useQueryClient();
  const cursor = useRef(0);
  useEffect(() => {
    const incoming = events.filter((event) => event.sequence > cursor.current);
    for (const event of incoming) {
      cursor.current = event.sequence;
      if (event.event_type.startsWith("analysis/")) {
        void client.invalidateQueries({
          queryKey: analysisKeys.jobs(sessionId),
        });
        void client.invalidateQueries({
          queryKey: analysisKeys.outputs(workspaceId),
        });
      }
      if (event.event_type === "map/changed") {
        void client.invalidateQueries({
          queryKey: analysisKeys.map(sessionId),
        });
        void client.invalidateQueries({
          queryKey: analysisKeys.layers(sessionId),
        });
      }
    }
  }, [client, events, sessionId, workspaceId]);
}

export function useAnalysis(sessionId: string, workspaceId: string) {
  const jobs = useQuery({
    queryKey: analysisKeys.jobs(sessionId),
    queryFn: () => analysisApi.jobs(sessionId),
    refetchInterval: (query) =>
      query.state.data?.some((job) =>
        ["submitting", "queued", "running", "collecting"].includes(job.state),
      )
        ? 3000
        : false,
  });
  const outputs = useQuery({
    queryKey: analysisKeys.outputs(workspaceId),
    queryFn: () => analysisApi.outputs(workspaceId),
  });
  return { jobs, outputs };
}
