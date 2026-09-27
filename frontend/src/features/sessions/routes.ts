import { matchPath } from "react-router-dom";

import type { AnalysisMode } from "@/app/store";

export interface SessionRoute {
  readonly pathname: string;
  readonly sessionId: string;
  readonly workspaceId: string;
}

const SESSION_ROUTE_PATTERNS = [
  "/workspaces/:workspaceId/sessions/:sessionId/overview",
  "/workspaces/:workspaceId/sessions/:sessionId/analysis/conversation",
  "/workspaces/:workspaceId/sessions/:sessionId/analysis/trace",
  "/workspaces/:workspaceId/sessions/:sessionId/map"
] as const;

export function parseSessionRoute(pathname: string): SessionRoute | null {
  for (const pattern of SESSION_ROUTE_PATTERNS) {
    const match = matchPath(pattern, pathname);
    const { sessionId, workspaceId } = match?.params ?? {};
    if (match !== null && sessionId !== undefined && workspaceId !== undefined) {
      return { pathname, sessionId, workspaceId };
    }
  }
  return null;
}

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
