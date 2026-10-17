import { AnalysisJobCard } from "@/features/analysis/AnalysisJobCard";

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
  return null;
}
