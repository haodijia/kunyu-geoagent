import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Plus } from "lucide-react";
import { useState } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";

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
import { productCopy } from "@/locales/zh-CN/product";
import { zhCN } from "@/locales/zh-CN";

const shellContent = zhCN.shell;
const content = zhCN.workspaceSidebar;

interface TaskSidebarContentProps {
  readonly collapsed: boolean;
  readonly onRequestExpand: () => void;
  readonly search: string;
  readonly onUpload: (workspace: Workspace) => void;
}

export function TaskSidebarContent({
  collapsed,
  onRequestExpand,
  search,
  onUpload,
}: TaskSidebarContentProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const sessionMatch = matchPath(
    "/workspaces/:workspaceId/sessions/:sessionId/*",
    location.pathname,
  );
  const workspaceMatch = matchPath(
    "/workspaces/:workspaceId/*",
    location.pathname,
  );
  const [choosingWorkspace, setChoosingWorkspace] = useState(false);
  const activeSessionId = sessionMatch?.params.sessionId ?? null;
  const [workspaceFormOpen, setWorkspaceFormOpen] = useState(false);
  const workspacesQuery = useQuery({
    queryKey: workspaceQueryKeys.all,
    queryFn: listWorkspaces,
  });
  const createWorkspaceMutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all });
      setWorkspaceFormOpen(false);
    },
  });
  const createSessionMutation = useMutation({
    mutationFn: (workspaceId: string) =>
      createSession(workspaceId, content.defaultSessionTitle),
    onSuccess: async (session) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.sessions(session.workspace_id),
        }),
        queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all }),
      ]);
      setChoosingWorkspace(false);
      void navigate(
        sessionAnalysisPath(session.workspace_id, session.id, "conversation"),
      );
    },
  });
  const newChatUnavailable =
    workspacesQuery.isPending || workspacesQuery.isError;

  function handleNewChat() {
    const currentWorkspace = workspacesQuery.data?.find(
      (workspace) => workspace.id === workspaceMatch?.params.workspaceId,
    );
    if (workspacesQuery.data?.length === 0) {
      if (collapsed) {
        onRequestExpand();
      }
      setWorkspaceFormOpen(true);
      return;
    }
    if (currentWorkspace !== undefined) {
      createSessionMutation.mutate(currentWorkspace.id);
    } else {
      if (collapsed) onRequestExpand();
      setChoosingWorkspace(true);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav
        className="grid shrink-0 gap-0.5 pt-1"
        aria-label={shellContent.navigationLabel}
      >
        <div className="flex items-center">
          <div className="min-w-0 flex-1">
            <SidebarItem
              collapsed={collapsed}
              icon={
                <span className="flex size-5 items-center justify-center rounded-[5px] border border-border bg-accent">
                  <Plus size={13} strokeWidth={1.8} />
                </span>
              }
              label={shellContent.newChat}
              onClick={handleNewChat}
              disabled={newChatUnavailable}
              pending={createSessionMutation.isPending}
            />
          </div>
        </div>
        <SidebarItem
          collapsed={collapsed}
          icon={<Globe size={15} strokeWidth={1.8} />}
          label={shellContent.geoSkill}
          onClick={() => void navigate("/settings/skills")}
        />
      </nav>

      {choosingWorkspace && !collapsed && (
        <div className="mx-2 my-2 rounded-xl border bg-background p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            {productCopy.chooseWorkspace}
          </p>
          {workspacesQuery.data?.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              disabled={createSessionMutation.isPending}
              className="block w-full truncate rounded-md px-2 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
              onClick={() => createSessionMutation.mutate(workspace.id)}
            >
              {workspace.name}
            </button>
          ))}
          <button
            className="mt-2 text-xs text-muted-foreground"
            onClick={() => setChoosingWorkspace(false)}
          >
            {content.cancel}
          </button>
        </div>
      )}
      {collapsed ? null : (
        <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-border pt-2">
          <div className="flex h-8 shrink-0 items-center px-2">
            <h2 className="m-0 flex-1 text-xs font-medium text-muted-foreground">
              {content.workspaces}
            </h2>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setWorkspaceFormOpen(true)}
              aria-label={content.createWorkspace}
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>

          {workspaceFormOpen ? (
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
              className="m-0 px-2 py-1 text-xs leading-4 text-destructive"
              role="alert"
            >
              {createSessionMutation.error.message}
            </p>
          ) : null}
          {workspacesQuery.isPending ? (
            <p className="m-0 px-2 py-2 text-xs text-muted-foreground">
              {content.loadingWorkspaces}
            </p>
          ) : null}
          {workspacesQuery.isError ? (
            <p
              className="m-0 px-2 py-2 text-xs leading-4 text-destructive"
              role="alert"
            >
              {workspacesQuery.error.message}
            </p>
          ) : null}
          {workspacesQuery.data?.length === 0 && !workspaceFormOpen ? (
            <p className="m-0 px-2 py-2 text-xs leading-4 text-muted-foreground">
              {content.emptyWorkspaces}
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {workspacesQuery.data?.map((workspace) => (
              <WorkspaceGroup
                key={workspace.id}
                activeSessionId={activeSessionId}
                workspace={workspace}
                search={search}
                onUpload={onUpload}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
