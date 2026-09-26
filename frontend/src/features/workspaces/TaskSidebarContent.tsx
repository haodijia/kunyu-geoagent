import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Box, Ellipsis, Plus } from "lucide-react";
import { useState } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";

import { SidebarItem } from "@/components/navigation/SidebarItem";
import { SidebarCreateForm } from "@/features/workspaces/SidebarCreateForm";
import { WorkspaceGroup } from "@/features/workspaces/WorkspaceGroup";
import {
  createSession,
  createWorkspace,
  listWorkspaces,
  workspaceQueryKeys
} from "@/features/workspaces/api";
import { sessionOverviewPath } from "@/features/workspaces/routes";
import { zhCN } from "@/locales/zh-CN";

const shellContent = zhCN.shell;
const content = zhCN.workspaceSidebar;

interface TaskSidebarContentProps {
  readonly collapsed: boolean;
  readonly onRequestExpand: () => void;
}

export function TaskSidebarContent({
  collapsed,
  onRequestExpand
}: TaskSidebarContentProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const sessionMatch = matchPath(
    "/workspaces/:workspaceId/sessions/:sessionId/*",
    location.pathname
  );
  const activeSessionId = sessionMatch?.params.sessionId ?? null;
  const [workspaceFormOpen, setWorkspaceFormOpen] = useState(false);
  const workspacesQuery = useQuery({
    queryKey: workspaceQueryKeys.all,
    queryFn: listWorkspaces
  });
  const createWorkspaceMutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all });
      setWorkspaceFormOpen(false);
    }
  });
  const createSessionMutation = useMutation({
    mutationFn: (workspaceId: string) =>
      createSession(workspaceId, content.defaultSessionTitle),
    onSuccess: async (session) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.sessions(session.workspace_id)
        }),
        queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all })
      ]);
      void navigate(sessionOverviewPath(session.workspace_id, session.id));
    }
  });

  function handleNewChat() {
    const firstWorkspace = workspacesQuery.data?.[0];
    if (firstWorkspace === undefined) {
      if (collapsed) {
        onRequestExpand();
      }
      setWorkspaceFormOpen(true);
      return;
    }
    createSessionMutation.mutate(firstWorkspace.id);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav className="grid shrink-0 gap-0.5" aria-label={shellContent.navigationLabel}>
        <SidebarItem
          collapsed={collapsed}
          framedIcon
          icon={<Plus size={14} strokeWidth={2} />}
          label={shellContent.newChat}
          onClick={handleNewChat}
          disabled={workspacesQuery.isPending || workspacesQuery.isError}
          pending={createSessionMutation.isPending}
        />
        <SidebarItem
          collapsed={collapsed}
          disabled
          icon={<Box size={16} strokeWidth={1.8} />}
          label={shellContent.geoSkill}
        />
        <SidebarItem
          collapsed={collapsed}
          disabled
          icon={<Ellipsis size={18} strokeWidth={2.4} />}
          label={shellContent.explore}
        />
        <SidebarItem
          collapsed={collapsed}
          disabled
          icon={<AlarmClock size={16} strokeWidth={1.8} />}
          label={shellContent.scheduledTasks}
        />
      </nav>

      {collapsed ? null : (
        <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-slate-200 pt-2">
          <div className="flex h-8 shrink-0 items-center px-2">
            <h2 className="m-0 flex-1 text-xs font-medium text-slate-500">
              {content.workspaces}
            </h2>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950"
              onClick={() => setWorkspaceFormOpen(true)}
              aria-label={content.createWorkspace}
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>

          {workspaceFormOpen ? (
            <SidebarCreateForm
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
            <p className="m-0 px-2 py-1 text-xs leading-4 text-red-600" role="alert">
              {createSessionMutation.error.message}
            </p>
          ) : null}
          {workspacesQuery.isPending ? (
            <p className="m-0 px-2 py-2 text-xs text-slate-400">
              {content.loadingWorkspaces}
            </p>
          ) : null}
          {workspacesQuery.isError ? (
            <p className="m-0 px-2 py-2 text-xs leading-4 text-red-600" role="alert">
              {workspacesQuery.error.message}
            </p>
          ) : null}
          {workspacesQuery.data?.length === 0 && !workspaceFormOpen ? (
            <p className="m-0 px-2 py-2 text-xs leading-4 text-slate-400">
              {content.emptyWorkspaces}
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {workspacesQuery.data?.map((workspace) => (
              <WorkspaceGroup
                key={workspace.id}
                activeSessionId={activeSessionId}
                workspace={workspace}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
