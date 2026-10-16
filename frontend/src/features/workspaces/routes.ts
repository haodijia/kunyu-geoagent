export function workspaceOverviewPath(workspaceId: string): string {
  return `/workspaces/${encodeURIComponent(workspaceId)}/overview`;
}
