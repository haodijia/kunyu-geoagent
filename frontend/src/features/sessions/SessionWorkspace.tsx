import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { useAppUiStore, type AnalysisMode } from "@/app/store";
import {
  clearLastSessionRoute,
  writeLastSessionRoute
} from "@/app/storage";
import { SessionEventProvider } from "@/features/events/SessionEventContext";
import { SessionMessagesProvider } from "@/features/messages/SessionMessagesContext";
import { getSession, sessionQueryKeys } from "@/features/sessions/api";
import { parseSessionRoute } from "@/features/sessions/routes";
import { SessionTitlebar } from "@/features/sessions/SessionTitlebar";
import { SessionWorkspaceProvider } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { FileWatchProvider } from "@/features/files/FileWatchContext";
import { FilePreviewProvider } from "@/features/files/FilePreviewContext";
import { FilePreviewLayout } from "@/features/files/FilePreviewLayout";
import { FileExplorerProvider } from "@/features/files/FileExplorerContext";
import { FileExplorerLayout } from "@/features/files/FileExplorer";

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
  const initializeMapContext = useAppUiStore((state) => state.initializeMapContext);
  const sessionQuery = useQuery({
    queryKey: sessionQueryKeys.detail(sessionId),
    queryFn: () => getSession(sessionId)
  });
  const analysisMode = routeAnalysisMode(location.pathname);

  useEffect(() => {
    initializeMapContext(sessionId, workspaceId);
  }, [initializeMapContext, sessionId, workspaceId]);

  useEffect(() => {
    if (analysisMode !== null) {
      setAnalysisMode(sessionId, analysisMode);
    }
  }, [analysisMode, sessionId, setAnalysisMode]);

  useEffect(() => {
    if (
      sessionQuery.data !== undefined &&
      sessionQuery.data.workspace_id === workspaceId &&
      !sessionQuery.data.archived &&
      parseSessionRoute(location.pathname) !== null
    ) {
      writeLastSessionRoute(location.pathname);
    }
  }, [location.pathname, sessionQuery.data, workspaceId]);

  if (sessionQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {content.loading}
      </div>
    );
  }

  if (sessionQuery.isError) {
    if (sessionQuery.error instanceof ApiError && sessionQuery.error.status === 404) {
      return <InvalidSessionRedirect />;
    }
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-destructive" role="alert">
        {sessionQuery.error.message}
      </div>
    );
  }

  if (sessionQuery.data.workspace_id !== workspaceId) {
    return <InvalidSessionRedirect />;
  }

  return (
    <SessionWorkspaceProvider session={sessionQuery.data}>
      <SessionEventProvider
        key={sessionQuery.data.id}
        sessionId={sessionQuery.data.id}
      >
        <SessionMessagesProvider
          sessionId={sessionQuery.data.id}
          workspaceId={sessionQuery.data.workspace_id}
        >
        <FileWatchProvider key={sessionQuery.data.id} sessionId={sessionQuery.data.id}>
        <FilePreviewProvider key={sessionQuery.data.id} sessionId={sessionQuery.data.id}>
        <FileExplorerProvider workspaceId={sessionQuery.data.workspace_id}>
        <section className="flex h-full min-h-0 flex-col bg-background">
          <SessionTitlebar />
          <div className="min-h-0 flex-1 overflow-hidden">
            <FileExplorerLayout><FilePreviewLayout><Outlet /></FilePreviewLayout></FileExplorerLayout>
          </div>
        </section>
        </FileExplorerProvider>
        </FilePreviewProvider>
        </FileWatchProvider>
        </SessionMessagesProvider>
      </SessionEventProvider>
    </SessionWorkspaceProvider>
  );
}

function InvalidSessionRedirect() {
  useLayoutEffect(() => {
    clearLastSessionRoute();
  }, []);
  return <Navigate to="/" replace />;
}
