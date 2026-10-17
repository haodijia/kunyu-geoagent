import { useSessionEvents } from "@/features/events/SessionEventContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import {
  cancelSubagent,
  listSubagents,
  subagentKeys,
  type Subagent,
} from "@/features/subagents/api";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const Dialog = lazy(() => import("./SubagentDialog"));
function useStateForParent() {
  const parent = useSessionWorkspace();
  const { events } = useSessionEvents();
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: subagentKeys.list(parent.id),
    queryFn: ({ signal }) => listSubagents(parent.id, signal),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.some((child) => child.settled_sequence === null)
        ? 1000
        : false,
  });
  const revision = events.findLast((event) =>
    event.event_type.startsWith("subagent/"),
  )?.sequence;
  useEffect(() => {
    if (revision !== undefined)
      void client.invalidateQueries({ queryKey: subagentKeys.list(parent.id) });
  }, [client, parent.id, revision]);
  const cancel = useMutation({
    mutationFn: (id: string) => cancelSubagent(parent.id, id),
    onSuccess: (child: Subagent) => {
      client.setQueryData(
        subagentKeys.detail(parent.id, child.child_id),
        child,
      );
      void client.invalidateQueries({ queryKey: subagentKeys.list(parent.id) });
    },
  });
  return {
    parentId: parent.id,
    archived: parent.archived,
    query,
    selected,
    open: setSelected,
    close: () => setSelected(null),
    cancel,
  };
}
const Context = createContext<ReturnType<typeof useStateForParent> | null>(
  null,
);
export function SubagentProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const state = useStateForParent();
  return (
    <Context value={state}>
      {children}
      {state.selected !== null && (
        <Suspense
          fallback={
            <div
              role="status"
              className="fixed bottom-4 right-4 rounded-lg border bg-background px-4 py-2 text-sm"
            >
              {zhCN.subagents.loading}
            </div>
          }
        >
          <Dialog
            key={state.selected}
            parentId={state.parentId}
            childId={state.selected}
            onClose={state.close}
          />
        </Suspense>
      )}
    </Context>
  );
}
export function useSubagents() {
  const state = useContext(Context);
  if (state === null)
    throw new Error("Subagent presentation requires the parent provider.");
  return state;
}
