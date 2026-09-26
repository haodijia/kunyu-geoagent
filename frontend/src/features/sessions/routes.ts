import type { AnalysisMode } from "@/app/store";

function sessionBasePath(workspaceId: string, sessionId: string): string {
  return (
    `/workspaces/${encodeURIComponent(workspaceId)}` +
    `/sessions/${encodeURIComponent(sessionId)}`
  );
}

export function sessionOverviewPath(
  workspaceId: string,
  sessionId: string
): string {
  return `${sessionBasePath(workspaceId, sessionId)}/overview`;
}

export function sessionAnalysisPath(
  workspaceId: string,
  sessionId: string,
  mode: AnalysisMode
): string {
  return `${sessionBasePath(workspaceId, sessionId)}/analysis/${mode}`;
}

export function sessionMapPath(
  workspaceId: string,
  sessionId: string
): string {
  return `${sessionBasePath(workspaceId, sessionId)}/map`;
}
