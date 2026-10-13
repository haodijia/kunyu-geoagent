import { useAnalysisInvalidation } from "./useAnalysis";
export function AnalysisEventsBridge({
  sessionId,
}: {
  readonly sessionId: string;
}) {
  useAnalysisInvalidation(sessionId);
  return null;
}
