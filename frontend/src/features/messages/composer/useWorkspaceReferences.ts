import { requestJson } from "@/api/client";
import { analysisApi, analysisKeys } from "@/features/analysis/api";
import type { WorkspaceReference } from "@/features/workspaces/references";
import { watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQuery } from "@tanstack/vue-query";
import {
  computed,
  reactive,
  shallowReactive,
  toValue,
  type MaybeRefOrGetter,
} from "vue";
export function useWorkspaceReferences(
  workspaceId: MaybeRefOrGetter<string>,
  sessionId: MaybeRefOrGetter<string>,
  query: MaybeRefOrGetter<string | null>,
) {
  const enabled = computed(() => toValue(query) !== null);
  const resources = reactive(
    useQuery(
      computed(() => ({
        queryKey: [
          "workspace-references",
          toValue(workspaceId),
          toValue(query),
        ],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          requestJson<
            (Omit<WorkspaceReference, "target"> & {
              file_path: string;
            })[]
          >(
            `/api/v1/workspaces/${encodeURIComponent(toValue(workspaceId))}/references?${new URLSearchParams(
              {
                query: toValue(query)!,
              },
            )}`,
            {
              signal,
            },
          ),
        enabled: enabled.value,
      })),
    ),
  );
  const layers = reactive(
    useQuery(
      computed(() => ({
        queryKey: analysisKeys.layers(toValue(sessionId)),
        queryFn: () => analysisApi.layers(toValue(sessionId)),
        enabled: enabled.value,
        staleTime: 5000,
      })),
    ),
  );
  const error = computed(() => resources.error ?? layers.error);
  watchMounted([() => toValue(workspaceId), () => error.value], () => {
    if (error.value !== null)
      console.error("[references] Workspace resources could not be loaded.", {
        workspaceId: toValue(workspaceId),
        error: error.value,
      });
  });
  const items = computed<WorkspaceReference[]>(() => {
    const values: WorkspaceReference[] =
      resources.data === undefined
        ? []
        : resources.data.map((item) => ({
            ...item,
            target: item.file_path
              .split("/")
              .map((part) => encodeURIComponent(part))
              .join("/"),
          }));
    if (layers.data !== undefined)
      for (const layer of layers.data) {
        if (layer.image !== null)
          values.push({
            name: layer.title,
            detail: `image_id: ${layer.image.image_id}`,
            kind: "image",
            target: `oge-image:${layer.image.image_id}`,
          });
      }
    return values;
  });
  const unique = computed(() => [
    ...new Map(items.value.map((item) => [item.target, item])).values(),
  ]);
  const needle = computed(() => toValue(query)?.toLocaleLowerCase() ?? "");
  return shallowReactive({
    get items() {
      return unique.value
        .filter((item) =>
          `${item.name} ${item.detail}`
            .toLocaleLowerCase()
            .includes(needle.value),
        )
        .slice(0, 50);
    },
    get pending() {
      return resources.isPending || layers.isPending;
    },
    get error() {
      return error.value === null
        ? null
        : zhCN.conversation.references.loadFailed;
    },
    get retry() {
      return () => {
        void resources.refetch();
        void layers.refetch();
      };
    },
  });
}
