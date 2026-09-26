import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Outlet, useLocation, useParams } from "react-router-dom";

import { useAppUiStore, type AnalysisMode } from "@/app/store";
import { getSession, sessionQueryKeys } from "@/features/sessions/api";
import { SessionTitlebar } from "@/features/sessions/SessionTitlebar";
import { SessionWorkspaceProvider } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.sessionWorkspace;

function routeAnalysisMode(pathname: string): AnalysisMode | null {
  if (pathname.endsWith("/analysis/conversation")) {
    return "conversation";
  }
  if (pathname.endsWith("/analysis/trace")) {
    return "trace";
  }
  return null;
}

export function SessionWorkspace() {
  const { sessionId, workspaceId } = useParams();
  if (sessionId === undefined || workspaceId === undefined) {
    throw new Error("Session workspace route parameters are required.");
  }

  return (
    <SessionWorkspaceContent
      sessionId={sessionId}
      workspaceId={workspaceId}
    />
  );
}

interface SessionWorkspaceContentProps {
  readonly sessionId: string;
  readonly workspaceId: string;
}

function SessionWorkspaceContent({
  sessionId,
  workspaceId
}: SessionWorkspaceContentProps) {
  const location = useLocation();
  const setAnalysisMode = useAppUiStore((state) => state.setAnalysisMode);
  const sessionQuery = useQuery({
    queryKey: sessionQueryKeys.detail(sessionId),
    queryFn: () => getSession(sessionId)
  });
  const analysisMode = routeAnalysisMode(location.pathname);

  useEffect(() => {
    if (analysisMode !== null) {
      setAnalysisMode(sessionId, analysisMode);
    }
  }, [analysisMode, sessionId, setAnalysisMode]);

  if (sessionQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        {content.loading}
      </div>
    );
  }

  if (sessionQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-red-600" role="alert">
        {sessionQuery.error.message}
      </div>
    );
  }

  if (sessionQuery.data.workspace_id !== workspaceId) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-red-600" role="alert">
        {content.workspaceMismatch}
      </div>
    );
  }

  return (
    <SessionWorkspaceProvider session={sessionQuery.data}>
      <section className="flex h-full min-h-0 flex-col bg-white">
        <SessionTitlebar />
        <div className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </section>
    </SessionWorkspaceProvider>
  );
}
