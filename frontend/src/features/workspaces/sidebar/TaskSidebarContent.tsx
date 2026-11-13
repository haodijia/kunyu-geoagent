import { matchRoute, useNavigation } from "@/app/navigation";
import { SidebarItem } from "@/components/navigation/SidebarItem";
import { sessionAnalysisPath } from "@/features/sessions/routes";
import {
  createSession,
  createWorkspace,
  listWorkspaces,
  workspaceQueryKeys,
  type Workspace,
} from "@/features/workspaces/api";
import { SidebarNameForm } from "@/features/workspaces/sidebar/SidebarNameForm";
import { WorkspaceGroup } from "@/features/workspaces/sidebar/WorkspaceGroup";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { productCopy } from "@/locales/zh-CN/product";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { Globe, Plus } from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
import { useRoute } from "vue-router";
const shellContent = zhCN.shell;
const content = zhCN.workspaceSidebar;
interface TaskSidebarContentProps {
  readonly collapsed: boolean;
  readonly onRequestExpand: () => void;
  readonly search: string;
  readonly onUpload: (workspace: Workspace) => void;
}
export const TaskSidebarContent = defineComponent(
  (componentProps: TaskSidebarContentProps, { slots: _slots }) => {
    const collapsed = computed(() => componentProps.collapsed),
      onRequestExpand = computed(() => componentProps.onRequestExpand),
      search = computed(() => componentProps.search),
      onUpload = computed(() => componentProps.onUpload);
    const navigate = useNavigation();
    const location = useRoute();
    const queryClient = useQueryClient();
    const sessionMatch = computed(() =>
      matchRoute(
        "/workspaces/:workspaceId/sessions/:sessionId/*",
        location.path,
      ),
    );
    const workspaceMatch = computed(() =>
      matchRoute("/workspaces/:workspaceId/*", location.path),
    );
    const choosingWorkspace = shallowRef(false),
      setChoosingWorkspace = refSetter(choosingWorkspace);
    const activeSessionId = computed(
      () => sessionMatch.value?.params.sessionId ?? null,
    );
    const workspaceFormOpen = shallowRef(false),
      setWorkspaceFormOpen = refSetter(workspaceFormOpen);
    const workspacesQuery = reactive(
      useQuery(
        computed(() => ({
          queryKey: workspaceQueryKeys.all,
          queryFn: listWorkspaces,
        })),
      ),
    );
    const createWorkspaceMutation = reactive(
      useMutation({
        mutationFn: createWorkspace,
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: workspaceQueryKeys.all,
          });
          setWorkspaceFormOpen(false);
        },
      }),
    );
    const createSessionMutation = reactive(
      useMutation({
        mutationFn: (workspaceId: string) =>
          createSession(workspaceId, content.defaultSessionTitle),
        onSuccess: async (session) => {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: workspaceQueryKeys.sessions(session.workspace_id),
            }),
            queryClient.invalidateQueries({
              queryKey: workspaceQueryKeys.all,
            }),
          ]);
          setChoosingWorkspace(false);
          void navigate(
            sessionAnalysisPath(
              session.workspace_id,
              session.id,
              "conversation",
            ),
          );
        },
      }),
    );
    const newChatUnavailable = computed(
      () => workspacesQuery.isPending || workspacesQuery.isError,
    );
    function handleNewChat() {
      const currentWorkspace = workspacesQuery.data?.find(
        (workspace) =>
          workspace.id === workspaceMatch.value?.params.workspaceId,
      );
      if (workspacesQuery.data?.length === 0) {
        if (collapsed.value) {
          onRequestExpand.value();
        }
        setWorkspaceFormOpen(true);
        return;
      }
      if (currentWorkspace !== undefined) {
        createSessionMutation.mutate(currentWorkspace.id);
      } else {
        if (collapsed.value) onRequestExpand.value();
        setChoosingWorkspace(true);
      }
    }
    return () => {
      const _collapsed = collapsed.value,
        _newChatUnavailable = newChatUnavailable.value,
        _activeSessionId = activeSessionId.value,
        _search = search.value,
        _onUpload = onUpload.value;
      return (
        <div class="flex min-h-0 flex-1 flex-col">
          <nav
            class="grid shrink-0 gap-0.5 pt-1"
            aria-label={shellContent.navigationLabel}
          >
            <div class="flex items-center">
              <div class="min-w-0 flex-1">
                <SidebarItem
                  collapsed={_collapsed}
                  icon={
                    <span class="flex size-5 items-center justify-center rounded-[5px] border border-border bg-accent">
                      <Plus size={13} strokeWidth={1.8} />
                    </span>
                  }
                  label={shellContent.newChat}
                  onClick={handleNewChat}
                  disabled={_newChatUnavailable}
                  pending={createSessionMutation.isPending}
                />
              </div>
            </div>
            <SidebarItem
              collapsed={_collapsed}
              icon={<Globe size={15} strokeWidth={1.8} />}
              label={shellContent.geoSkill}
              onClick={() => void navigate("/settings/skills")}
            />
          </nav>

          {choosingWorkspace.value && !_collapsed && (
            <div class="mx-2 my-2 rounded-xl border bg-background p-3">
              <p class="mb-2 text-xs text-muted-foreground">
                {productCopy.chooseWorkspace}
              </p>
              {workspacesQuery.data?.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  disabled={createSessionMutation.isPending}
                  class="block w-full truncate rounded-md px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                  onClick={() => createSessionMutation.mutate(workspace.id)}
                >
                  {workspace.name}
                </button>
              ))}
              <button
                class="mt-2 text-xs text-muted-foreground"
                onClick={() => setChoosingWorkspace(false)}
              >
                {content.cancel}
              </button>
            </div>
          )}
          {_collapsed ? null : (
            <div class="mt-2 flex min-h-0 flex-1 flex-col border-t border-border pt-2">
              <div class="flex h-8 shrink-0 items-center px-2">
                <h2 class="m-0 flex-1 text-xs font-medium text-muted-foreground">
                  {content.workspaces}
                </h2>
                <button
                  type="button"
                  class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => setWorkspaceFormOpen(true)}
                  aria-label={content.createWorkspace}
                >
                  <Plus class="size-4" aria-hidden="true" />
                </button>
              </div>

              {workspaceFormOpen.value ? (
                <SidebarNameForm
                  error={createWorkspaceMutation.error?.message ?? null}
                  label={content.createWorkspace}
                  pending={createWorkspaceMutation.isPending}
                  placeholder={content.workspaceNamePlaceholder}
                  onCancel={() => {
                    createWorkspaceMutation.reset();
                    setWorkspaceFormOpen(false);
                  }}
                  onSubmit={(name) => createWorkspaceMutation.mutate(name)}
                />
              ) : null}

              {createSessionMutation.isError ? (
                <p
                  class="m-0 px-2 py-1 text-xs leading-4 text-destructive"
                  role="alert"
                >
                  {createSessionMutation.error.message}
                </p>
              ) : null}
              {workspacesQuery.isPending ? (
                <p class="m-0 px-2 py-2 text-xs text-muted-foreground">
                  {content.loadingWorkspaces}
                </p>
              ) : null}
              {workspacesQuery.isError ? (
                <p
                  class="m-0 px-2 py-2 text-xs leading-4 text-destructive"
                  role="alert"
                >
                  {workspacesQuery.error.message}
                </p>
              ) : null}
              {workspacesQuery.data?.length === 0 &&
              !workspaceFormOpen.value ? (
                <p class="m-0 px-2 py-2 text-xs leading-4 text-muted-foreground">
                  {content.emptyWorkspaces}
                </p>
              ) : null}

              <div class="min-h-0 flex-1 overflow-y-auto">
                {workspacesQuery.data?.map((workspace) => (
                  <WorkspaceGroup
                    key={workspace.id}
                    activeSessionId={_activeSessionId}
                    workspace={workspace}
                    search={_search}
                    onUpload={_onUpload}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      );
    };
  },
  {
    name: "TaskSidebarContent",
    inheritAttrs: false,
    props: ["collapsed", "onRequestExpand", "search", "onUpload"],
  },
);
