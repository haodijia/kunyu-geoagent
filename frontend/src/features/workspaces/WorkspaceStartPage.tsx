import { useNavigation } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import { sessionAnalysisPath } from "@/features/sessions/routes";
import {
  createSession,
  createWorkspace,
  listSessions,
  type Workspace,
  workspaceQueryKeys,
} from "@/features/workspaces/api";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { productCopy as copy } from "@/locales/zh-CN/product";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { FolderClosed, MessageCircle } from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
import { ConnectionReadiness } from "./ConnectionReadiness";
import { workspaceOverviewPath } from "./routes";
import { SidebarNameForm } from "./sidebar/SidebarNameForm";
const content = zhCN.workspaceStart;
interface WorkspaceStartPageProps {
  readonly workspaces: readonly Workspace[];
}
export const WorkspaceStartPage = defineComponent(
  (componentProps: WorkspaceStartPageProps, { slots: _slots }) => {
    const workspaces = computed(() => componentProps.workspaces);
    const client = useQueryClient();
    const navigate = useNavigation();
    const creating = shallowRef(false),
      setCreating = refSetter(creating);
    const create = reactive(
      useMutation({
        mutationFn: createWorkspace,
        onSuccess: async (workspace) => {
          await client.invalidateQueries({
            queryKey: workspaceQueryKeys.all,
          });
          void navigate(workspaceOverviewPath(workspace.id));
        },
        onError: (error) => console.error("[workspace] Creation failed", error),
      }),
    );
    return () => {
      const _workspaces = workspaces.value;
      return (
        <div class="min-h-full bg-muted px-8 py-12">
          <section class="mx-auto w-full max-w-[920px]">
            <p class="m-0 text-xs font-semibold tracking-normal text-muted-foreground uppercase">
              {content.eyebrow}
            </p>
            <h1 class="mt-2 mb-0 text-3xl font-semibold tracking-normal text-foreground">
              {copy.startTitle}
            </h1>
            <p class="mt-3 mb-8 max-w-2xl text-sm leading-6 text-muted-foreground">
              {copy.startHint}
            </p>

            <div class="mb-6">
              <ConnectionReadiness />
            </div>
            <div class="mb-6 flex items-center justify-between gap-4">
              <h2 class="text-base font-semibold">{copy.recent}</h2>
              <Button onClick={() => setCreating(true)}>
                {copy.createWorkspace}
              </Button>
            </div>
            {creating.value && (
              <div class="mb-6 rounded-xl border bg-background p-4">
                <SidebarNameForm
                  label={copy.createWorkspace}
                  placeholder={copy.workspaceName}
                  pending={create.isPending}
                  error={create.error?.message ?? null}
                  onSubmit={(name) => create.mutate(name)}
                  onCancel={() => setCreating(false)}
                />
              </div>
            )}
            {_workspaces.length === 0 ? (
              <div class="rounded-2xl border border-dashed border-input bg-background px-8 py-12 text-center">
                <FolderClosed
                  class="mx-auto size-8 text-muted-foreground"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
                <h2 class="mt-4 mb-0 text-base font-semibold text-foreground">
                  {content.emptyTitle}
                </h2>
                <p class="mt-2 mb-0 text-sm text-muted-foreground">
                  {content.emptyDescription}
                </p>
              </div>
            ) : (
              <div class="grid gap-4">
                {_workspaces.slice(0, 4).map((workspace) => (
                  <RecentWorkspace key={workspace.id} workspace={workspace} />
                ))}
              </div>
            )}
          </section>
        </div>
      );
    };
  },
  {
    name: "WorkspaceStartPage",
    inheritAttrs: false,
    props: ["workspaces"],
  },
);
const RecentWorkspace = defineComponent(
  (
    componentProps: {
      readonly workspace: Workspace;
    },
    { slots: _slots },
  ) => {
    const workspace = computed(() => componentProps.workspace);
    const navigate = useNavigation();
    const client = useQueryClient();
    const create = reactive(
      useMutation({
        mutationFn: () =>
          createSession(
            workspace.value.id,
            zhCN.workspaceSidebar.defaultSessionTitle,
          ),
        onSuccess: async (session) => {
          await client.invalidateQueries({
            queryKey: workspaceQueryKeys.sessions(workspace.value.id),
          });
          void navigate(
            sessionAnalysisPath(workspace.value.id, session.id, "conversation"),
          );
        },
        onError: (error) => console.error("[session] Creation failed", error),
      }),
    );
    const sessionsQuery = reactive(
      useQuery(
        computed(() => ({
          queryKey: workspaceQueryKeys.sessions(workspace.value.id),
          queryFn: () => listSessions(workspace.value.id),
        })),
      ),
    );
    return () => {
      const _workspace = workspace.value;
      return (
        <section class="rounded-2xl border border-border bg-background p-5 shadow-sm">
          <div class="flex items-center gap-3">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-secondary-foreground">
              <FolderClosed
                class="size-4.5"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </span>
            <h2 class="m-0 min-w-0 flex-1 truncate text-base font-semibold text-foreground">
              <button
                type="button"
                onClick={() =>
                  void navigate(workspaceOverviewPath(_workspace.id))
                }
              >
                {_workspace.name}
              </button>
            </h2>
          </div>

          <div class="mt-4 flex gap-2">
            <Button
              size="sm"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              {copy.newSession}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void navigate(workspaceOverviewPath(_workspace.id))
              }
            >
              {copy.openWorkspace}
            </Button>
          </div>
          {create.isError && (
            <p role="alert" class="mt-2 text-sm text-destructive">
              {create.error.message}
            </p>
          )}
          {sessionsQuery.isPending ? (
            <p class="mt-4 mb-0 text-sm text-muted-foreground">
              {content.loadingSessions}
            </p>
          ) : null}
          {sessionsQuery.isError ? (
            <div
              class="mt-4 flex items-center gap-3 text-sm text-destructive"
              role="alert"
            >
              <span>{content.loadSessionsFailed}</span>
              <button
                type="button"
                class="font-medium underline"
                onClick={() => void sessionsQuery.refetch()}
              >
                {content.retry}
              </button>
            </div>
          ) : null}
          {sessionsQuery.data?.length === 0 ? (
            <p class="mt-4 mb-0 text-sm text-muted-foreground">
              {content.emptySessions}
            </p>
          ) : null}
          {sessionsQuery.data !== undefined && sessionsQuery.data.length > 0 ? (
            <div class="mt-4 grid gap-1 border-t border-border pt-3">
              {sessionsQuery.data.slice(0, 3).map((session) => (
                <button
                  key={session.id}
                  type="button"
                  class="flex h-9 min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm text-secondary-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() =>
                    void navigate(
                      sessionAnalysisPath(
                        _workspace.id,
                        session.id,
                        "conversation",
                      ),
                    )
                  }
                >
                  <MessageCircle
                    class="size-3.5 shrink-0"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span class="truncate">{session.title}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      );
    };
  },
  {
    name: "RecentWorkspace",
    inheritAttrs: false,
    props: ["workspace"],
  },
);
