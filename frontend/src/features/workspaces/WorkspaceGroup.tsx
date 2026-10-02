import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "@icon-park/react";
import { Tooltip } from "@/components/ui/tooltip";
import WorkspaceCollapse from "./WorkspaceCollapse";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { SidebarNameForm } from "@/features/workspaces/SidebarNameForm";
import { sessionOverviewPath } from "@/features/sessions/routes";
import {
  createSession,
  listSessions,
  renameWorkspace,
  type Workspace,
  workspaceQueryKeys,
} from "@/features/workspaces/api";
import { WorkspaceActions } from "./WorkspaceActions";
import { SessionRow } from "@/features/sessions/SessionRow";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.workspaceSidebar;

interface WorkspaceGroupProps {
  readonly activeSessionId: string | null;
  readonly workspace: Workspace;
  readonly search: string;
}

export function WorkspaceGroup({
  activeSessionId,
  workspace,
  search,
}: WorkspaceGroupProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<"session" | "rename" | null>(null);
  const [expanded, setExpanded] = useState(true);
  const sessionsQuery = useQuery({
    queryKey: workspaceQueryKeys.sessions(workspace.id),
    queryFn: () => listSessions(workspace.id),
  });
  const createMutation = useMutation({
    mutationFn: (title: string) => createSession(workspace.id, title),
    onSuccess: async (session) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.sessions(workspace.id),
        }),
        queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all }),
      ]);
      setForm(null);
      void navigate(sessionOverviewPath(session.workspace_id, session.id));
    },
  });
  const renameMutation = useMutation({
    mutationFn: (name: string) => renameWorkspace(workspace.id, name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all });
      setForm(null);
      toast.success(content.renameSuccess);
    },
    onError: (error) => {
      console.error("[workspaces] Rename failed", error);
      toast.error(content.renameFailed);
    },
  });

  function openForm(next: "session" | "rename") {
    createMutation.reset();
    renameMutation.reset();
    setExpanded(true);
    setForm(next);
  }

  return (
    <WorkspaceCollapse
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      stickyHeader
      stickyTop={0}
      header={
        <span className="min-w-0 flex-1 truncate text-[13px] font-normal text-t-primary">
          {workspace.name}
        </span>
      }
      trailing={
        <span className="flex items-center gap-[6px]">
          <Tooltip label={content.createSession} side="top">
            <button
              type="button"
              className="sider-action-btn hidden size-[20px] cursor-pointer items-center justify-center rounded-[4px] border-0 p-0 text-t-secondary transition-colors group-hover:flex group-focus-within:flex hover:text-t-primary"
              disabled={createMutation.isPending || renameMutation.isPending}
              onClick={() => openForm("session")}
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
          <WorkspaceActions
            workspace={workspace}
            disabled={createMutation.isPending || renameMutation.isPending}
            onRename={() => openForm("rename")}
          />
        </span>
      }
    >
      {form === "session" ? (
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
      {form === "rename" ? (
        <SidebarNameForm
          key="rename"
          initialValue={workspace.name}
          error={renameMutation.error === null ? null : content.renameFailed}
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
        <p className="m-0 px-8 py-1 text-xs text-muted-foreground">
          {content.loadingSessions}
        </p>
      ) : null}
      {sessionsQuery.isError ? (
        <p
          className="m-0 px-8 py-1 text-xs leading-4 text-destructive"
          role="alert"
        >
          {sessionsQuery.error.message}
        </p>
      ) : null}
      {sessionsQuery.data?.length === 0 ? (
        <p className="m-0 px-8 py-1 text-xs text-muted-foreground">
          {content.emptySessions}
        </p>
      ) : null}
      <div className="mt-px grid gap-[2px]">
        {sessionsQuery.data
          ?.filter(
            (session) =>
              search === "" ||
              `${workspace.name} ${session.title}`
                .toLocaleLowerCase()
                .includes(search.toLocaleLowerCase()),
          )
          .map((session) => (
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
