import { useNavigation } from "@/app/navigation";
import { Tooltip } from "@/components/ui/tooltip";
import { sessionAnalysisPath } from "@/features/sessions/routes";
import { SessionRow } from "@/features/sessions/SessionRow";
import {
  createSession,
  listSessions,
  renameWorkspace,
  type Workspace,
  workspaceQueryKeys,
} from "@/features/workspaces/api";
import { SidebarNameForm } from "@/features/workspaces/sidebar/SidebarNameForm";
import { WorkspaceActions } from "@/features/workspaces/sidebar/WorkspaceActions";
import WorkspaceCollapse from "@/features/workspaces/sidebar/WorkspaceCollapse";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { Plus } from "@icon-park/vue-next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, defineComponent, reactive, shallowRef } from "vue";
import { toast } from "vue-sonner";
const content = zhCN.workspaceSidebar;
interface WorkspaceGroupProps {
  readonly activeSessionId: string | null;
  readonly workspace: Workspace;
  readonly search: string;
  readonly onUpload: (workspace: Workspace) => void;
}
export const WorkspaceGroup = defineComponent(
  (componentProps: WorkspaceGroupProps, { slots: _slots }) => {
    const activeSessionId = computed(() => componentProps.activeSessionId),
      workspace = computed(() => componentProps.workspace),
      search = computed(() => componentProps.search),
      onUpload = computed(() => componentProps.onUpload);
    const navigate = useNavigation();
    const queryClient = useQueryClient();
    const form = shallowRef<"session" | "rename" | null>(null),
      setForm = refSetter(form);
    const expanded = shallowRef(true),
      setExpanded = refSetter(expanded);
    const sessionsQuery = reactive(
      useQuery(
        computed(() => ({
          queryKey: workspaceQueryKeys.sessions(workspace.value.id),
          queryFn: () => listSessions(workspace.value.id),
        })),
      ),
    );
    const createMutation = reactive(
      useMutation({
        mutationFn: (title: string) => createSession(workspace.value.id, title),
        onSuccess: async (session) => {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: workspaceQueryKeys.sessions(workspace.value.id),
            }),
            queryClient.invalidateQueries({
              queryKey: workspaceQueryKeys.all,
            }),
          ]);
          setForm(null);
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
    const renameMutation = reactive(
      useMutation({
        mutationFn: (name: string) => renameWorkspace(workspace.value.id, name),
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: workspaceQueryKeys.all,
          });
          setForm(null);
          toast.success(content.renameSuccess);
        },
        onError: (error) => {
          console.error("[workspaces] Rename failed", error);
          toast.error(content.renameFailed);
        },
      }),
    );
    function openForm(next: "session" | "rename") {
      createMutation.reset();
      renameMutation.reset();
      setExpanded(true);
      setForm(next);
    }
    return () => {
      const _workspace = workspace.value,
        _onUpload = onUpload.value,
        _search = search.value,
        _activeSessionId = activeSessionId.value;
      return (
        <WorkspaceCollapse
          expanded={expanded.value}
          onToggle={() => setExpanded(!expanded.value)}
          stickyHeader
          stickyTop={0}
          header={
            <span class="min-w-0 flex-1 truncate text-[13px] font-normal text-t-primary">
              {_workspace.name}
            </span>
          }
          trailing={
            <span class="flex items-center gap-[6px]">
              <Tooltip label={content.createSession} side="top">
                <button
                  type="button"
                  class="sider-action-btn hidden size-[20px] cursor-pointer items-center justify-center rounded-[4px] border-0 p-0 text-t-secondary transition-colors group-hover:flex group-focus-within:flex hover:text-t-primary"
                  disabled={
                    createMutation.isPending || renameMutation.isPending
                  }
                  onClick={() => openForm("session")}
                  aria-label={`${content.createSessionIn}${_workspace.name}`}
                >
                  <Plus
                    theme="outline"
                    size="14"
                    fill="currentColor"
                    class="block leading-none"
                  />
                </button>
              </Tooltip>
              <WorkspaceActions
                workspace={_workspace}
                disabled={createMutation.isPending || renameMutation.isPending}
                onRename={() => openForm("rename")}
                onUpload={() => _onUpload(_workspace)}
              />
            </span>
          }
        >
          {form.value === "session" ? (
            <SidebarNameForm
              key="session"
              error={createMutation.error?.message ?? null}
              label={content.createSession}
              pending={createMutation.isPending}
              placeholder={content.sessionTitlePlaceholder}
              onCancel={() => {
                createMutation.reset();
                setForm(null);
              }}
              onSubmit={(title) => createMutation.mutate(title)}
            />
          ) : null}
          {form.value === "rename" ? (
            <SidebarNameForm
              key="rename"
              initialValue={_workspace.name}
              error={
                renameMutation.error === null ? null : content.renameFailed
              }
              label={content.saveWorkspaceName}
              pending={renameMutation.isPending}
              placeholder={content.workspaceNamePlaceholder}
              onCancel={() => {
                renameMutation.reset();
                setForm(null);
              }}
              onSubmit={(name) => renameMutation.mutate(name)}
            />
          ) : null}

          {sessionsQuery.isPending ? (
            <p class="m-0 px-8 py-1 text-xs text-muted-foreground">
              {content.loadingSessions}
            </p>
          ) : null}
          {sessionsQuery.isError ? (
            <p
              class="m-0 px-8 py-1 text-xs leading-4 text-destructive"
              role="alert"
            >
              {sessionsQuery.error.message}
            </p>
          ) : null}
          {sessionsQuery.data?.length === 0 ? (
            <p class="m-0 px-8 py-1 text-xs text-muted-foreground">
              {content.emptySessions}
            </p>
          ) : null}
          <div class="mt-px grid gap-[2px]">
            {sessionsQuery.data
              ?.filter(
                (session) =>
                  _search === "" ||
                  `${_workspace.name} ${session.title}`
                    .toLocaleLowerCase()
                    .includes(_search.toLocaleLowerCase()),
              )
              .map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  selected={session.id === _activeSessionId}
                />
              ))}
          </div>
        </WorkspaceCollapse>
      );
    };
  },
  {
    name: "WorkspaceGroup",
    inheritAttrs: false,
    props: ["activeSessionId", "workspace", "search", "onUpload"],
  },
);
