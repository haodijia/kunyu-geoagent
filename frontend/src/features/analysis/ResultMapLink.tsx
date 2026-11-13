import { useNavigation } from "@/app/navigation";
import { useAppUiStore } from "@/app/store";
import { sessionMapPath } from "@/features/sessions/routes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, defineComponent, reactive, type VNodeChild } from "vue";
import { useRoute } from "vue-router";
import { analysisApi, analysisKeys } from "./api";

/** Resolve result file citations within the current workspace before changing the map. */
export const ResultMapLink = defineComponent(
  (
    componentProps: {
      readonly path: string;
      readonly children?: VNodeChild;
    },
    { slots },
  ) => {
    const path = computed(() => componentProps.path),
      children = () => slots.default?.();
    const _route = useRoute(),
      workspaceId = computed(() =>
        _route.params.workspaceId === undefined
          ? undefined
          : String(_route.params.workspaceId),
      ),
      sessionId = computed(() =>
        _route.params.sessionId === undefined
          ? undefined
          : String(_route.params.sessionId),
      );
    const navigate = useNavigation();
    const client = useQueryClient();
    const outputs = reactive(
      useQuery(
        computed(() => ({
          queryKey: analysisKeys.outputs(workspaceId.value ?? ""),
          queryFn: () => analysisApi.outputs(workspaceId.value!),
          enabled:
            workspaceId.value !== undefined && sessionId.value !== undefined,
        })),
      ),
    );
    const output = computed(() =>
      outputs.data?.find(
        (item) =>
          item.file_path.split("/").map(encodeURIComponent).join("/") ===
            path.value || item.file_path === path.value,
      ),
    );
    const open = reactive(
      useMutation({
        mutationFn: async () => {
          if (
            output.value === undefined ||
            sessionId.value === undefined ||
            workspaceId.value === undefined
          )
            return;
          const layer = await analysisApi.addLayer(
            sessionId.value,
            output.value.id,
            output.value.metadata.default_view,
          );
          const store = useAppUiStore();
          store.initializeMapContext(sessionId.value, workspaceId.value);
          store.inspectMapLayer(sessionId.value, layer.id);
          store.focusMap(sessionId.value, output.value.bounds);
          store.setMapComparison(sessionId.value, null);
          await client.invalidateQueries({
            queryKey: analysisKeys.layers(sessionId.value),
          });
          void navigate(sessionMapPath(workspaceId.value, sessionId.value));
        },
        onError: (error) =>
          console.error("[results] Citation navigation failed", error),
      }),
    );
    return () => {
      const _output = output.value;
      if (_output === undefined) return <span>{children()}</span>;
      return (
        <span>
          <button
            type="button"
            class="text-primary underline underline-offset-2 disabled:opacity-50"
            disabled={open.isPending}
            onClick={() => open.mutate()}
          >
            {children()}
          </button>
          {open.isError && (
            <span role="alert" class="ms-2 text-xs text-destructive">
              {open.error.message}
            </span>
          )}
        </span>
      );
    };
  },
  {
    name: "ResultMapLink",
    inheritAttrs: false,
    props: ["path"],
  },
);
