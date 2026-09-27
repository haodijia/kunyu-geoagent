import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderClosed, Plus } from "lucide-react";
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
    <section aria-label={workspace.name}>
      <div className="group flex h-8 items-center gap-2 rounded-md px-2 text-slate-700">
        <FolderClosed className="size-4 shrink-0" strokeWidth={1.8} />
        <h3 className="m-0 min-w-0 flex-1 truncate text-sm font-medium">
          {workspace.name}
        </h3>
        <WorkspaceActions workspace={workspace} />
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:opacity-100 group-hover:opacity-100"
          onClick={() => setFormOpen(true)}
          aria-label={`${content.createSessionIn}${workspace.name}`}
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </div>

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
        <p className="m-0 px-8 py-1 text-xs leading-4 text-red-600" role="alert">
          {sessionsQuery.error.message}
        </p>
      ) : null}
      {sessionsQuery.data?.length === 0 ? (
        <p className="m-0 px-8 py-1 text-xs text-slate-400">
          {content.emptySessions}
        </p>
      ) : null}
      <div className="grid gap-0.5">
        {sessionsQuery.data?.map((session) => (
          <SessionRow key={session.id} session={session} selected={session.id === activeSessionId} />
        ))}
      </div>
    </section>
  );
}
