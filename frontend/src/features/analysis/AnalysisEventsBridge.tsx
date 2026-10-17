import { useAnalysisInvalidation } from "@/features/analysis/useAnalysis";
export function AnalysisEventsBridge({
  sessionId,
  workspaceId,
}: {
  readonly sessionId: string;
  readonly workspaceId: string;
}) {
  useAnalysisInvalidation(sessionId, workspaceId);
  return null;
}
