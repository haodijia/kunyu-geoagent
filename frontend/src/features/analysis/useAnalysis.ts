import { analysisApi, analysisKeys } from "@/features/analysis/api";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { watchMounted } from "@/lib/lifecycle";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  computed,
  reactive,
  shallowRef,
  toRefs,
  toValue,
  type MaybeRefOrGetter,
} from "vue";
export function useAnalysisInvalidation(
  sessionId: MaybeRefOrGetter<string>,
  workspaceId: MaybeRefOrGetter<string>,
) {
  const { events } = toRefs(useSessionEvents());
  const client = useQueryClient();
  const cursor = shallowRef(0);
  watchMounted(
    [
      () => client,
      () => events.value,
      () => toValue(sessionId),
      () => toValue(workspaceId),
    ],
    () => {
      const incoming = events.value.filter(
        (event) => event.sequence > cursor.value,
      );
      for (const event of incoming) {
        cursor.value = event.sequence;
        if (event.event_type === "analysis/output") {
          void client.invalidateQueries({
            queryKey: analysisKeys.outputs(toValue(workspaceId)),
          });
          void client.invalidateQueries({
            queryKey: [
              "analysis",
              "workspaces",
              toValue(workspaceId),
              "output",
            ],
          });
        }
        if (event.event_type === "map/changed") {
          void client.invalidateQueries({
            queryKey: analysisKeys.layers(toValue(sessionId)),
          });
        }
      }
    },
  );
}
export function useAnalysisOutputs(workspaceId: MaybeRefOrGetter<string>) {
  return reactive(
    useQuery(
      computed(() => ({
        queryKey: analysisKeys.outputs(toValue(workspaceId)),
        queryFn: () => analysisApi.outputs(toValue(workspaceId)),
      })),
    ),
  );
}
