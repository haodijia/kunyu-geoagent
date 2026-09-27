import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/api/client";
import {
  clearLastSessionRoute,
  readLastSessionRoute
} from "@/app/storage";
import { Button } from "@/components/ui/button";
import { getSession, sessionQueryKeys } from "@/features/sessions/api";
import { parseSessionRoute, type SessionRoute } from "@/features/sessions/routes";
import {
  listWorkspaces,
  workspaceQueryKeys
} from "@/features/workspaces/api";
import { WorkspaceStartPage } from "@/features/workspaces/WorkspaceStartPage";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.workspaceStart;

function readStoredRoute(): SessionRoute | null {
  const pathname = readLastSessionRoute();
  if (pathname === null) {
    return null;
  }
  const route = parseSessionRoute(pathname);
  if (route === null) {
    console.error("[navigation] Removing invalid stored session route.", { pathname });
    clearLastSessionRoute();
  }
  return route;
}

export function LaunchPage() {
  const navigate = useNavigate();
  const [storedRoute, setStoredRoute] = useState<SessionRoute | null>(readStoredRoute);
  const workspacesQuery = useQuery({
    queryKey: workspaceQueryKeys.all,
    queryFn: listWorkspaces
  });
  const sessionQuery = useQuery({
    queryKey: storedRoute === null
      ? ["sessions", "restore", "none"]
      : sessionQueryKeys.detail(storedRoute.sessionId),
    queryFn: () => {
      if (storedRoute === null) {
        throw new Error("A stored session route is required for restoration.");
      }
      return getSession(storedRoute.sessionId);
    },
    enabled: storedRoute !== null
  });

  useEffect(() => {
    if (storedRoute === null || workspacesQuery.data === undefined) {
      return;
    }
    if (sessionQuery.error instanceof ApiError && sessionQuery.error.status === 404) {
      clearLastSessionRoute();
      setStoredRoute(null);
      return;
    }
    if (sessionQuery.data === undefined) {
      return;
    }
    const workspaceExists = workspacesQuery.data.some(
      (workspace) => workspace.id === storedRoute.workspaceId
    );
    if (
      !workspaceExists ||
      sessionQuery.data.workspace_id !== storedRoute.workspaceId
    ) {
      clearLastSessionRoute();
      setStoredRoute(null);
      return;
    }
    void navigate(storedRoute.pathname, { replace: true });
  }, [navigate, sessionQuery.data, sessionQuery.error, storedRoute, workspacesQuery.data]);

  if (workspacesQuery.isPending || (storedRoute !== null && sessionQuery.isPending)) {
    return <LaunchStatus message={storedRoute === null ? content.loading : content.restoring} />;
  }
  if (workspacesQuery.isError) {
    return (
      <LaunchError
        message={content.loadFailed}
        onRetry={() => void workspacesQuery.refetch()}
      />
    );
  }
  if (storedRoute !== null) {
    if (sessionQuery.isError && !(sessionQuery.error instanceof ApiError && sessionQuery.error.status === 404)) {
      return (
        <LaunchError
          message={content.restoreFailed}
          onRetry={() => void sessionQuery.refetch()}
        />
      );
    }
    return <LaunchStatus message={content.restoring} />;
  }
  return <WorkspaceStartPage workspaces={workspacesQuery.data} />;
}

function LaunchStatus({ message }: { readonly message: string }) {
  return (
    <div className="flex min-h-full items-center justify-center p-8 text-sm text-slate-500">
      {message}
    </div>
  );
}

interface LaunchErrorProps {
  readonly message: string;
  readonly onRetry: () => void;
}

function LaunchError({ message, onRetry }: LaunchErrorProps) {
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="text-center">
        <p className="mt-0 mb-4 text-sm text-red-600" role="alert">{message}</p>
        <Button type="button" variant="outline" onClick={onRetry}>{content.retry}</Button>
      </div>
    </div>
  );
}
