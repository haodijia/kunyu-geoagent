import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "@icon-park/react";
import { Tooltip } from "@arco-design/web-react";
import WorkspaceCollapse from "./WorkspaceCollapse";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { SidebarCreateForm } from "@/features/workspaces/SidebarCreateForm";
import { sessionOverviewPath } from "@/features/sessions/routes";
import {
  createSession,
  listSessions,
  type Workspace,
  workspaceQueryKeys
} from "@/features/workspaces/api";
import { WorkspaceActions } from "./WorkspaceActions";
import { SessionRow } from "@/features/sessions/SessionRow";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.workspaceSidebar;

interface WorkspaceGroupProps {
  readonly activeSessionId: string | null;
  readonly workspace: Workspace;
}

export function WorkspaceGroup({
  activeSessionId,
  workspace
}: WorkspaceGroupProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const sessionsQuery = useQuery({
    queryKey: workspaceQueryKeys.sessions(workspace.id),
    queryFn: () => listSessions(workspace.id)
  });
  const createMutation = useMutation({
    mutationFn: (title: string) => createSession(workspace.id, title),
    onSuccess: async (session) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.sessions(workspace.id)
        }),
        queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all })
      ]);
      setFormOpen(false);
      void navigate(sessionOverviewPath(session.workspace_id, session.id));
    }
  });

  return (
    <WorkspaceCollapse
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      stickyHeader
      stickyTop={0}
      header={
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-t-primary">
          {workspace.name}
        </span>
      }
      trailing={
        <span className="flex items-center gap-[6px]">
          <Tooltip content={content.createSession} position="top">
            <button
              type="button"
              className="sider-action-btn hidden size-[20px] cursor-pointer items-center justify-center rounded-[4px] border-0 p-0 text-t-secondary transition-colors group-hover:flex group-focus-within:flex hover:text-t-primary"
              onClick={() => {
                setExpanded(true);
                setFormOpen(true);
              }}
              aria-label={`${content.createSessionIn}${workspace.name}`}
            >
              <Plus
                theme="outline"
                size="14"
                fill="currentColor"
                className="block leading-none"
              />
            </button>
          </Tooltip>
          {sessionsQuery.data && (
            <WorkspaceActions
              workspace={workspace}
              sessions={sessionsQuery.data}
            />
          )}
        </span>
      }
    >
      {formOpen ? (
        <SidebarCreateForm
          error={createMutation.error?.message ?? null}
          label={content.createSession}
          pending={createMutation.isPending}
          placeholder={content.sessionTitlePlaceholder}
          onCancel={() => {
            createMutation.reset();
            setFormOpen(false);
          }}
          onSubmit={(title) => createMutation.mutate(title)}
        />
      ) : null}

      {sessionsQuery.isPending ? (
        <p className="m-0 px-8 py-1 text-xs text-slate-400">
          {content.loadingSessions}
        </p>
      ) : null}
      {sessionsQuery.isError ? (
        <p
          className="m-0 px-8 py-1 text-xs leading-4 text-red-600"
          role="alert"
        >
          {sessionsQuery.error.message}
        </p>
      ) : null}
      {sessionsQuery.data?.length === 0 ? (
        <p className="m-0 px-8 py-1 text-xs text-slate-400">
          {content.emptySessions}
        </p>
      ) : null}
      <div className="mt-px grid gap-[2px]">
        {sessionsQuery.data?.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            selected={session.id === activeSessionId}
          />
        ))}
      </div>
    </WorkspaceCollapse>
  );
}
