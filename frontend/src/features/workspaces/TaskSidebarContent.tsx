import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Box, CirclePlus, Ellipsis, Plus, SquarePen } from "lucide-react";
import { useState } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";

import { SidebarItem } from "@/components/navigation/SidebarItem";
import { Tooltip } from "@/components/ui/tooltip";
import { sessionOverviewPath } from "@/features/sessions/routes";
import { SidebarCreateForm } from "@/features/workspaces/SidebarCreateForm";
import { WorkspaceGroup } from "@/features/workspaces/WorkspaceGroup";
import {
  createSession,
  createWorkspace,
  listWorkspaces,
  workspaceQueryKeys
} from "@/features/workspaces/api";
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
  const newChatUnavailable = workspacesQuery.isPending || workspacesQuery.isError;

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
        <div className="flex items-center">
          <div className="min-w-0 flex-1">
            <SidebarItem
              collapsed={collapsed}
              icon={<SquarePen size={16} strokeWidth={1.9} />}
              label={shellContent.newChat}
              onClick={handleNewChat}
              disabled={newChatUnavailable}
              pending={createSessionMutation.isPending}
            />
          </div>
          {collapsed ? null : (
            <Tooltip label={content.createSession}>
              <button
                type="button"
                className="mr-2.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-disabled:cursor-default aria-disabled:hover:bg-transparent disabled:pointer-events-none"
                onClick={newChatUnavailable ? undefined : handleNewChat}
                disabled={createSessionMutation.isPending}
                aria-disabled={newChatUnavailable || undefined}
                aria-busy={createSessionMutation.isPending || undefined}
                aria-label={content.createSession}
              >
                <CirclePlus size={16} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </Tooltip>
          )}
        </div>
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
            <p className="m-0 px-2 py-1 text-xs leading-4 text-destructive" role="alert">
              {createSessionMutation.error.message}
            </p>
          ) : null}
          {workspacesQuery.isPending ? (
            <p className="m-0 px-2 py-2 text-xs text-muted-foreground">
              {content.loadingWorkspaces}
            </p>
          ) : null}
          {workspacesQuery.isError ? (
            <p className="m-0 px-2 py-2 text-xs leading-4 text-destructive" role="alert">
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
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
