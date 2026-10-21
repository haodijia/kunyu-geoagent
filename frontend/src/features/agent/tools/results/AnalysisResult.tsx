import { OutputCard } from "@/features/analysis/OutputCard";
import { useAnalysisOutputs } from "@/features/analysis/useAnalysis";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { jobById, jobError } from "@/features/jobs/job-state";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.analysis;

export function AnalysisResult({ jobId }: { readonly jobId: string }) {
  const session = useSessionWorkspace();
  const { records } = useSessionEvents();
  const outputs = useAnalysisOutputs(session.workspace_id);
  if (outputs.isError)
    return (
      <p role="alert" className="text-xs text-destructive">
        {content.loadFailed}
      </p>
    );
  if (outputs.isPending)
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {content.loading}
      </p>
    );
  const output = outputs.data.find((item) => item.job_id === jobId);
  if (output !== undefined)
    return (
      <OutputCard
        key={output.id}
        output={output}
        workspaceId={session.workspace_id}
        sessionId={session.id}
        compact
      />
    );
  const job = jobById(jobId, records);
  if (job === undefined)
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {content.loading}
      </p>
    );
  const status =
    job.status === "killed"
      ? "cancelled"
      : job.status === "stopping"
        ? "running"
        : job.status;
  const error = jobError(job);
  return (
    <div className="space-y-1 text-xs" role="status">
      <p className="text-muted-foreground">
        {zhCN.conversation.tools.status[status]} ·{" "}
        {zhCN.conversation.tools.jobStages[job.stage]}
      </p>
      {job.detail !== null && <p className="text-warning">{job.detail}</p>}
      {error !== null && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {job.status === "completed" && (
        <p className="text-muted-foreground">{content.loading}</p>
      )}
    </div>
  );
}
