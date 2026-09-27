import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderClosed, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { listWorkspaces, workspaceQueryKeys } from "@/features/workspaces/api";
import { zhCN } from "@/locales/zh-CN";
import {
  listArchivedSessions,
  sessionQueryKeys,
  setSessionArchived
} from "./api";
import { sessionOverviewPath } from "./routes";

const content = zhCN.archivedSessions;

export function ArchivedSessionsPage() {
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: sessionQueryKeys.archived,
    queryFn: listArchivedSessions
  });
  const workspaces = useQuery({
    queryKey: workspaceQueryKeys.all,
    queryFn: listWorkspaces
  });
  const restore = useMutation({
    mutationFn: (id: string) => setSessionArchived(id, false),
    onSuccess: async (session) => {
      queryClient.setQueryData(sessionQueryKeys.detail(session.id), session);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionQueryKeys.archived }),
        queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.sessions(session.workspace_id)
        })
      ]);
    },
    onError: (error) => console.error("[sessions] Restore failed", error)
  });
  const error = sessions.error ?? workspaces.error ?? restore.error;
  return (
    <section className="mx-auto max-w-3xl p-8">
      <h1 className="m-0 text-xl font-semibold">{content.title}</h1>
      <p className="mt-2 text-sm text-slate-500">{content.description}</p>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error.message}
        </p>
      )}
      {sessions.isPending || workspaces.isPending ? (
        <p className="py-10 text-center text-sm text-slate-400">
          {content.loading}
        </p>
      ) : null}
      {sessions.data?.length === 0 && (
        <p className="py-16 text-center text-sm text-slate-400">
          {content.empty}
        </p>
      )}
      <div className="mt-8 grid gap-6">
        {workspaces.data?.map((workspace) => {
          const rows = sessions.data?.filter(
            (session) => session.workspace_id === workspace.id
          );
          if (!rows?.length) return null;
          return (
            <section key={workspace.id}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-500">
                <FolderClosed className="size-4" />
                {workspace.name}
                <span className="ml-auto text-xs">{rows.length}</span>
              </h2>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {rows.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0"
                  >
                    <MessageCircle className="size-4 shrink-0 text-slate-500" />
                    <Link
                      to={sessionOverviewPath(session.workspace_id, session.id)}
                      className="min-w-0 flex-1 truncate text-sm text-slate-800 hover:underline"
                    >
                      {session.title}
                    </Link>
                    <Button
                      variant="outline"
                      className="h-7 px-3 text-xs"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(session.id)}
                    >
                      {content.restore}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
