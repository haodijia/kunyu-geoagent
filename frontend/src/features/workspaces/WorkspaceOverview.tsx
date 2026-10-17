import { useQuery } from "@tanstack/react-query";
import { FolderClosed } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { analysisApi, analysisKeys } from "@/features/analysis/api";
import { OutputCard } from "@/features/analysis/OutputCard";
import { getSession, sessionQueryKeys } from "@/features/sessions/api";
import { sessionAnalysisPath } from "@/features/sessions/routes";
import {
  getWorkspace,
  listSessions,
  workspaceQueryKeys,
} from "@/features/workspaces/api";
import { WorkspaceViewSwitcher } from "@/features/workspaces/WorkspaceViewSwitcher";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.overview;

export function WorkspaceOverview() {
  const { workspaceId } = useParams();
  if (workspaceId === undefined)
    throw new Error("Workspace overview requires a workspace identifier.");
  return (
    <WorkspaceOverviewContent key={workspaceId} workspaceId={workspaceId} />
  );
}

function WorkspaceOverviewContent({
  workspaceId,
}: {
  readonly workspaceId: string;
}) {
  const location = useLocation();
  const originSessionId: unknown = location.state?.sessionId;
  const workspace = useQuery({
    queryKey: workspaceQueryKeys.detail(workspaceId),
    queryFn: () => getWorkspace(workspaceId),
  });
  const sessions = useQuery({
    queryKey: workspaceQueryKeys.sessions(workspaceId),
    queryFn: () => listSessions(workspaceId),
  });
  const outputs = useQuery({
    queryKey: analysisKeys.outputs(workspaceId),
    queryFn: () => analysisApi.outputs(workspaceId),
    refetchInterval: 5000,
  });
  const originSession = sessions.data?.find(
    (session) => session.id === originSessionId,
  );

  if (workspace.isPending)
    return (
      <p className="p-8 text-sm text-muted-foreground" role="status">
        {content.loading}
      </p>
    );
  if (workspace.isError)
    return (
      <p className="p-8 text-sm text-destructive" role="alert">
        {workspace.error.message}
      </p>
    );

  return (
    <section
      className="h-full overflow-y-auto bg-background px-6 py-8 md:px-10"
      aria-label={content.title}
    >
      <WorkspaceOverviewTitlebar
        workspaceId={workspaceId}
        name={workspace.data.name}
        sessionId={originSession === undefined ? null : originSession.id}
      />
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <h1 className="text-xl font-semibold">
            {workspace.data.name} · {content.results}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {content.description}
          </p>
        </header>
        {outputs.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            {content.loading}
          </p>
        ) : outputs.isError ? (
          <div
            role="alert"
            className="flex items-center gap-3 text-sm text-destructive"
          >
            {content.loadFailed}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void outputs.refetch()}
            >
              {content.retry}
            </Button>
          </div>
        ) : outputs.data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {content.emptyResults}
          </p>
        ) : (
          <div className="grid items-start gap-x-10 gap-y-8 lg:grid-cols-2">
            {outputs.data.map((output) => (
              <article
                key={output.id}
                className="min-w-0 border-t border-border pt-4"
              >
                <ResultSource
                  sessionId={output.session_id}
                  sourceTitle={output.source_session_title}
                  workspaceId={workspaceId}
                />
                <OutputCard
                  output={output}
                  workspaceId={workspaceId}
                  compact
                  sessionId={
                    originSession !== undefined
                      ? originSession.id
                      : sessions.isSuccess &&
                          sessions.data.some(
                            (session) => session.id === output.session_id,
                          )
                        ? output.session_id
                        : null
                  }
                />
                <time
                  dateTime={output.created_at}
                  className="text-xs text-muted-foreground"
                >
                  {new Date(output.created_at).toLocaleString("zh-CN")}
                </time>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ResultSource({
  sessionId,
  sourceTitle,
  workspaceId,
}: {
  readonly sessionId: string | null;
  readonly sourceTitle: string;
  readonly workspaceId: string;
}) {
  if (sessionId === null)
    return (
      <p className="text-xs text-muted-foreground">
        {content.sourceSession} · {sourceTitle} · {content.deletedSession}
      </p>
    );
  return (
    <ExistingResultSource sessionId={sessionId} workspaceId={workspaceId} />
  );
}

function ExistingResultSource({
  sessionId,
  workspaceId,
}: {
  readonly sessionId: string;
  readonly workspaceId: string;
}) {
  const session = useQuery({
    queryKey: sessionQueryKeys.detail(sessionId),
    queryFn: () => getSession(sessionId),
  });
  if (session.isPending)
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {content.loadingSource}
      </p>
    );
  if (session.isError)
    return (
      <p role="alert" className="text-xs text-destructive">
        {content.sourceFailed}
      </p>
    );
  return (
    <p className="text-xs text-muted-foreground">
      {content.sourceSession} ·{" "}
      {session.data.archived ? (
        <span>
          {session.data.title} · {content.archivedSession}
        </span>
      ) : (
        <Link
          className="hover:text-foreground hover:underline"
          to={sessionAnalysisPath(workspaceId, sessionId, "conversation")}
        >
          {session.data.title}
        </Link>
      )}
    </p>
  );
}

function WorkspaceOverviewTitlebar({
  workspaceId,
  name,
  sessionId,
}: {
  readonly workspaceId: string;
  readonly name: string;
  readonly sessionId: string | null;
}) {
  const [targets, setTargets] = useState<{
    title: HTMLElement;
    mode: HTMLElement;
  } | null>(null);
  useEffect(() => {
    const title = document.getElementById("session-titlebar-title-slot");
    const mode = document.getElementById("session-titlebar-mode-slot");
    if (title === null || mode === null)
      throw new Error("Workspace titlebar slots are required.");
    setTargets({ title, mode });
  }, []);
  if (targets === null) return null;
  return (
    <>
      {createPortal(
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 text-base font-semibold [-webkit-app-region:no-drag]">
          <FolderClosed className="size-[18px] shrink-0" />
          <span className="truncate">{name}</span>
        </div>,
        targets.title,
      )}
      {createPortal(
        <WorkspaceViewSwitcher
          workspaceId={workspaceId}
          sessionId={sessionId}
        />,
        targets.mode,
      )}
    </>
  );
}
