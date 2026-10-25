import { useQuery } from "@tanstack/react-query";
import { FolderClosed } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { analysisApi, analysisKeys } from "@/features/analysis/api";
import { getWorkspace, listSessions, workspaceQueryKeys } from "./api";
import { WorkspaceFileBrowser } from "./files/WorkspaceFileBrowser";
import { WorkspaceResults } from "./WorkspaceResults";
import { WorkspaceViewSwitcher } from "./WorkspaceViewSwitcher";
import { WorkspaceMetrics } from "./overview/WorkspaceMetrics";
import { WorkspaceKnowledge } from "./overview/WorkspaceKnowledge";
import { getOverview, overviewKey } from "./overview/overview-api";
import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";
import "./overview/overview.css";

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
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [fileLocation, setFileLocation] = useState<{ path: string } | null>(
    null,
  );
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
  const overview = useQuery({
    queryKey: overviewKey(workspaceId),
    queryFn: ({ signal }) => getOverview(workspaceId, signal),
    refetchInterval: 5000,
  });
  const originSession = sessions.data?.find(
    (session) => session.id === originSessionId,
  );
  if (workspace.isPending)
    return (
      <p className="overview-message" role="status">
        {copy.loading}
      </p>
    );
  if (workspace.isError)
    return (
      <p className="overview-message text-destructive" role="alert">
        {workspace.error.message}
      </p>
    );
  const outputCount = outputs.data?.filter(
    (output) =>
      output.metadata.bundle_id === undefined ||
      output.metadata.bundle_id === output.id,
  ).length;
  return (
    <section className="workspace-overview" aria-label="工作区总览">
      <WorkspaceOverviewTitlebar
        workspaceId={workspaceId}
        name={workspace.data.name}
        sessionId={originSession?.id ?? null}
      />
      <header className="overview-page-heading">
        <div className="min-w-0">
          <div className="overview-eyebrow">{copy.eyebrow}</div>
          <h1>{workspace.data.name}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <div className="overview-workspace-counts">
          <span>
            <strong>{sessions.data?.length ?? "—"}</strong>
            {copy.sessions}
          </span>
          <span>
            <strong>{outputCount ?? "—"}</strong>
            {copy.resultUnit}
          </span>
        </div>
      </header>
      <div className="overview-grid">
        <WorkspaceFileBrowser
          workspace={workspace.data}
          outputs={outputs.data ?? []}
          sessionId={originSession?.id ?? null}
          location={fileLocation}
          onSelectOutput={setSelectedOutputId}
        />
        {outputs.isSuccess ? (
          <WorkspaceResults
            outputs={outputs.data}
            workspaceId={workspaceId}
            sessions={sessions.data ?? []}
            originSessionId={originSession?.id ?? null}
            selectedId={selectedOutputId}
            onSelect={setSelectedOutputId}
            onLocate={(path) => setFileLocation({ path })}
          />
        ) : (
          <OverviewQueryState
            title={copy.results}
            error={outputs.error}
            retry={() => void outputs.refetch()}
          />
        )}
        {overview.isSuccess ? (
          <WorkspaceMetrics metrics={overview.data.metrics} />
        ) : (
          <OverviewQueryState
            title={copy.metrics}
            error={overview.error}
            retry={() => void overview.refetch()}
          />
        )}
        {overview.isSuccess ? (
          <WorkspaceKnowledge
            workspaceId={workspaceId}
            memories={overview.data.memories}
            count={overview.data.memory_count}
          />
        ) : (
          <OverviewQueryState
            title={copy.knowledge}
            error={overview.error}
            retry={() => void overview.refetch()}
          />
        )}
      </div>
      {sessions.isError && (
        <p className="text-xs text-destructive" role="alert">
          {sessions.error.message}
        </p>
      )}
    </section>
  );
}
function OverviewQueryState({
  title,
  error,
  retry,
}: {
  readonly title: string;
  readonly error: Error | null;
  readonly retry: () => void;
}) {
  return (
    <section className="overview-panel">
      <header className="overview-panel-heading">
        <h2>{title}</h2>
      </header>
      <div
        className="overview-empty"
        role={error === null ? "status" : "alert"}
      >
        <p>{error?.message ?? copy.loading}</p>
        {error !== null && (
          <Button variant="outline" size="sm" onClick={retry}>
            {copy.retry}
          </Button>
        )}
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
