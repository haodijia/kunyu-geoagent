import { useSessionEvents } from "@/features/events/SessionEventContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import {
  cancelSubagent,
  listSubagents,
  subagentKeys,
  type Subagent,
} from "@/features/subagents/api";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  computed,
  defineAsyncComponent,
  defineComponent,
  inject,
  provide,
  reactive,
  shallowReactive,
  shallowRef,
  Suspense,
  toRefs,
  type InjectionKey,
  type VNodeChild,
} from "vue";
const Dialog = defineAsyncComponent(() => import("./SubagentDialog"));
function useStateForParent() {
  const parent = useSessionWorkspace();
  const { events } = toRefs(useSessionEvents());
  const client = useQueryClient();
  const selected = shallowRef<string | null>(null),
    setSelected = refSetter(selected);
  const query = reactive(
    useQuery(
      computed(() => ({
        queryKey: subagentKeys.list(parent.id),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          listSubagents(parent.id, signal),
        retry: false,
        refetchInterval: (query: {
          state: { data: Subagent[] | undefined };
        }) =>
          query.state.data?.some((child) => child.settled_sequence === null)
            ? 1000
            : false,
      })),
    ),
  );
  const revision = computed(
    () =>
      events.value.findLast((event) => event.event_type.startsWith("subagent/"))
        ?.sequence,
  );
  watchMounted([() => client, () => parent.id, () => revision.value], () => {
    if (revision.value !== undefined)
      void client.invalidateQueries({
        queryKey: subagentKeys.list(parent.id),
      });
  });
  const cancel = reactive(
    useMutation({
      mutationFn: (id: string) => cancelSubagent(parent.id, id),
      onSuccess: (child: Subagent) => {
        client.setQueryData(
          subagentKeys.detail(parent.id, child.child_id),
          child,
        );
        void client.invalidateQueries({
          queryKey: subagentKeys.list(parent.id),
        });
      },
    }),
  );
  return shallowReactive({
    get parentId() {
      return parent.id;
    },
    get archived() {
      return parent.archived;
    },
    get query() {
      return query;
    },
    get selected() {
      return selected.value;
    },
    get open() {
      return setSelected;
    },
    get close() {
      return () => setSelected(null);
    },
    get cancel() {
      return cancel;
    },
  });
}
const Context: InjectionKey<ReturnType<typeof useStateForParent> | null> =
  Symbol("Context");
export const SubagentProvider = defineComponent(
  (
    _componentProps: {
      readonly children?: VNodeChild;
    },
    { slots },
  ) => {
    const children = () => slots.default?.();
    const state = useStateForParent();
    provide(Context, state);
    return () => {
      const selected = state.selected;
      return (
        <>
          {children()}
          {selected !== null && (
            <Suspense
              v-slots={{
                default: () => (
                  <Dialog
                    key={selected}
                    parentId={state.parentId}
                    childId={selected}
                    onClose={state.close}
                  />
                ),
                fallback: () => (
                  <div
                    role="status"
                    class="fixed bottom-4 right-4 rounded-lg border bg-background px-4 py-2 text-sm"
                  >
                    {zhCN.subagents.loading}
                  </div>
                ),
              }}
            />
          )}
        </>
      );
    };
  },
  {
    name: "SubagentProvider",
    inheritAttrs: false,
    props: [],
  },
);
export function useSubagents() {
  const state = inject(Context, null);
  if (state === null)
    throw new Error("Subagent presentation requires the parent provider.");
  return state;
}
