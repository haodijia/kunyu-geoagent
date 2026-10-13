import { useQuery } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { analysisApi, analysisKeys } from "./api";
import { OutputCard } from "./OutputCard";

const content = zhCN.analysis;
export function AnalysisJobCard({
  jobId,
  sessionId,
}: {
  readonly jobId: string;
  readonly sessionId: string;
}) {
  const session = useSessionWorkspace();
  const jobs = useQuery({
    queryKey: analysisKeys.jobs(sessionId),
    queryFn: () => analysisApi.jobs(sessionId),
    refetchInterval: (query) =>
      query.state.data?.some((job) =>
        ["submitting", "queued", "running", "collecting"].includes(job.state),
      )
        ? 2000
        : false,
  });
  const outputs = useQuery({
    queryKey: analysisKeys.outputs(sessionId),
    queryFn: () => analysisApi.outputs(sessionId),
    refetchInterval: jobs.data?.some((job) =>
      ["submitting", "queued", "running", "collecting"].includes(job.state),
    )
      ? 2000
      : false,
  });
  const job = jobs.data?.find((item) => item.id === jobId);
  if (jobs.isError || outputs.isError)
    return (
      <p className="mt-2 text-xs text-destructive" role="alert">
        {content.loadFailed}
      </p>
    );
  if (job === undefined)
    return (
      <p className="mt-2 text-xs text-muted-foreground" role="status">
        {content.loading}
      </p>
    );
  const active = ["submitting", "queued", "running", "collecting"].includes(
    job.state,
  );
  const result = outputs.data?.find((item) => item.job_id === job.id);
  return (
    <div className="mt-2 space-y-2" data-analysis-job={job.id}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
        {active ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : job.state === "failed" || job.state === "submission_unknown" ? (
          <AlertCircle className="size-3.5 text-destructive" />
        ) : null}
        <span className="font-medium">NDVI</span>
        <span>{content.states[job.state]}</span>
        <span className="ml-auto text-muted-foreground">
          {job.mode === "replay" ? content.replay : content.live}
        </span>
      </div>
      {job.query_state !== "ready" ? (
        <p className="text-xs text-warning">
          {content.queryStates[job.query_state]}
        </p>
      ) : null}
      {job.error_message !== null ? (
        <p className="text-xs text-destructive">{job.error_message}</p>
      ) : null}
      {result !== undefined ? (
        <OutputCard
          output={result}
          workspaceId={session.workspace_id}
          compact
        />
      ) : null}
    </div>
  );
}
