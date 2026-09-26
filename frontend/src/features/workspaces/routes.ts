export function sessionOverviewPath(
  workspaceId: string,
  sessionId: string
): string {
  return (
    `/workspaces/${encodeURIComponent(workspaceId)}` +
    `/sessions/${encodeURIComponent(sessionId)}/overview`
  );
}
