import { useQuery } from "@tanstack/react-query";
import { FolderClosed, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { sessionOverviewPath } from "@/features/sessions/routes";
import {
  listSessions,
  type Workspace,
  workspaceQueryKeys
} from "@/features/workspaces/api";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.workspaceStart;

interface WorkspaceStartPageProps {
  readonly workspaces: readonly Workspace[];
}

export function WorkspaceStartPage({ workspaces }: WorkspaceStartPageProps) {
  return (
    <div className="min-h-full bg-slate-50 px-8 py-12">
      <section className="mx-auto w-full max-w-[920px]">
        <p className="m-0 text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
          {content.eyebrow}
        </p>
        <h1 className="mt-2 mb-0 text-3xl font-semibold tracking-tight text-slate-950">
          {content.title}
        </h1>
        <p className="mt-3 mb-8 max-w-2xl text-sm leading-6 text-slate-500">
          {content.description}
        </p>

        {workspaces.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-12 text-center">
            <FolderClosed className="mx-auto size-8 text-slate-400" strokeWidth={1.6} aria-hidden="true" />
            <h2 className="mt-4 mb-0 text-base font-semibold text-slate-900">
              {content.emptyTitle}
            </h2>
            <p className="mt-2 mb-0 text-sm text-slate-500">
              {content.emptyDescription}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {workspaces.slice(0, 4).map((workspace) => (
              <RecentWorkspace key={workspace.id} workspace={workspace} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RecentWorkspace({ workspace }: { readonly workspace: Workspace }) {
  const navigate = useNavigate();
  const sessionsQuery = useQuery({
    queryKey: workspaceQueryKeys.sessions(workspace.id),
    queryFn: () => listSessions(workspace.id)
  });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <FolderClosed className="size-4.5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <h2 className="m-0 min-w-0 flex-1 truncate text-base font-semibold text-slate-950">
          {workspace.name}
        </h2>
      </div>

      {sessionsQuery.isPending ? (
        <p className="mt-4 mb-0 text-sm text-slate-400">{content.loadingSessions}</p>
      ) : null}
      {sessionsQuery.isError ? (
        <div className="mt-4 flex items-center gap-3 text-sm text-red-600" role="alert">
          <span>{content.loadSessionsFailed}</span>
          <button type="button" className="font-medium underline" onClick={() => void sessionsQuery.refetch()}>
            {content.retry}
          </button>
        </div>
      ) : null}
      {sessionsQuery.data?.length === 0 ? (
        <p className="mt-4 mb-0 text-sm text-slate-400">{content.emptySessions}</p>
      ) : null}
      {sessionsQuery.data !== undefined && sessionsQuery.data.length > 0 ? (
        <div className="mt-4 grid gap-1 border-t border-slate-100 pt-3">
          {sessionsQuery.data.slice(0, 3).map((session) => (
            <button
              key={session.id}
              type="button"
              className="flex h-9 min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
              onClick={() => void navigate(sessionOverviewPath(workspace.id, session.id))}
            >
              <MessageCircle className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
              <span className="truncate">{session.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
