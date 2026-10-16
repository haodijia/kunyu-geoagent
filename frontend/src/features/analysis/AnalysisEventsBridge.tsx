import { useAnalysisInvalidation } from "./useAnalysis";
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
