import { useQuery } from "@tanstack/react-query";
import { FolderClosed } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { analysisApi, analysisKeys } from "@/features/analysis/api";
import {
  getWorkspace,
  listSessions,
  workspaceQueryKeys,
} from "@/features/workspaces/api";
import { WorkspaceFileBrowser } from "@/features/workspaces/files/WorkspaceFileBrowser";
import { WorkspaceResults } from "@/features/workspaces/WorkspaceResults";
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
          <h1 className="text-xl font-semibold">{workspace.data.name}</h1>
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
        ) : (
          <WorkspaceResults
            outputs={outputs.data}
            workspaceId={workspaceId}
            sessions={sessions.data ?? []}
            originSessionId={originSession?.id ?? null}
          />
        )}
        {sessions.isError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {content.sourceFailed}
          </p>
        )}
        <WorkspaceFileBrowser
          workspaceId={workspaceId}
          outputs={outputs.data ?? []}
          sessionId={originSession?.id ?? null}
        />
      </div>
    </section>
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
