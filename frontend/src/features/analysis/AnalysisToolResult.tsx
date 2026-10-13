import { useQuery } from "@tanstack/react-query";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { analysisApi, analysisKeys } from "./api";
import { AnalysisJobCard } from "./AnalysisJobCard";
import { OutputCard } from "./OutputCard";

export function AnalysisToolResult({
  value,
  sessionId,
}: {
  readonly value: unknown;
  readonly sessionId: string;
}) {
  if (value === null || typeof value !== "object") return null;
  if ("analysis_job_id" in value && typeof value.analysis_job_id === "string")
    return (
      <AnalysisJobCard sessionId={sessionId} jobId={value.analysis_job_id} />
    );
  if (
    "analysis_output_id" in value &&
    typeof value.analysis_output_id === "string"
  )
    return (
      <OutputReference
        sessionId={sessionId}
        outputId={value.analysis_output_id}
      />
    );
  return null;
}
function OutputReference({
  sessionId,
  outputId,
}: {
  readonly sessionId: string;
  readonly outputId: string;
}) {
  const session = useSessionWorkspace();
  const outputs = useQuery({
    queryKey: analysisKeys.outputs(sessionId),
    queryFn: () => analysisApi.outputs(sessionId),
  });
  const output = outputs.data?.find((item) => item.id === outputId);
  if (outputs.isError)
    return (
      <p className="text-xs text-destructive" role="alert">
        {zhCN.analysis.loadFailed}
      </p>
    );
  if (output === undefined)
    return (
      <p className="text-xs text-muted-foreground">{zhCN.analysis.loading}</p>
    );
  return (
    <div className="mt-2">
      <OutputCard output={output} workspaceId={session.workspace_id} compact />
    </div>
  );
}
