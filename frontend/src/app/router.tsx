import { Navigate, createHashRouter, useParams } from "react-router-dom";

import { useAppUiStore } from "@/app/store";
import { SessionWorkspace } from "@/features/sessions/SessionWorkspace";
import { ConversationView } from "@/features/sessions/views/ConversationView";
import { OverviewView } from "@/features/sessions/views/OverviewView";
import { ConnectionStatusPage } from "../features/system/ConnectionStatusPage";
import { AppShell } from "./AppShell";

function AnalysisIndexRedirect() {
  const { sessionId } = useParams();
  if (sessionId === undefined) {
    throw new Error("Analysis route requires a session identifier.");
  }
  const mode = useAppUiStore(
    (state) => state.analysisModeBySession[sessionId] ?? "conversation"
  );
  return <Navigate to={mode} replace />;
}

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <ConnectionStatusPage />
      },
      {
        path: "workspaces/:workspaceId/sessions/:sessionId",
        element: <SessionWorkspace />,
        children: [
          {
            index: true,
            element: <Navigate to="overview" replace />
          },
          {
            path: "overview",
            element: <OverviewView />
          },
          {
            path: "analysis",
            element: <AnalysisIndexRedirect />
          },
          {
            path: "analysis/conversation",
            element: <ConversationView />
          },
          {
            path: "analysis/trace",
            lazy: async () => {
              const { TraceView } = await import("@/features/sessions/views/TraceView");
              return { Component: TraceView };
            }
          },
          {
            path: "map",
            lazy: async () => {
              const { MapView } = await import(
                "@/features/sessions/views/MapView"
              );
              return { Component: MapView };
            }
          },
          {
            path: "*",
            element: <Navigate to="overview" replace />
          }
        ]
      },
      {
        path: "*",
        element: <Navigate to="/" replace />
      }
    ]
  }
]);
