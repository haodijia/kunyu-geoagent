import { Navigate, createHashRouter, useParams } from "react-router-dom";

import { useAppUiStore } from "@/app/store";
import { ArchivedSessionsPage } from "@/features/sessions/ArchivedSessionsPage";
import { ModelConnectionCreatePage } from "@/features/settings/models/ModelConnectionCreatePage";
import { ModelConnectionDetailPage } from "@/features/settings/models/ModelConnectionDetailPage";
import { ModelConnectionsPage } from "@/features/settings/models/ModelConnectionsPage";
import { ModelProviderCatalogPage } from "@/features/settings/models/ModelProviderCatalogPage";
import { SkillsPage } from "@/features/settings/skills/SkillsPage";
import { SkillEditorPage } from "@/features/settings/skills/SkillEditorPage";
import { SessionWorkspace } from "@/features/sessions/SessionWorkspace";
import { ConversationView } from "@/features/sessions/views/ConversationView";
import { OverviewView } from "@/features/sessions/views/OverviewView";
import { LaunchPage } from "@/features/workspaces/LaunchPage";
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
      { path: "settings/archived", element: <ArchivedSessionsPage /> },
      { path: "settings/skills", element: <SkillsPage /> },
      { path: "settings/skills/new", element: <SkillEditorPage /> },
      { path: "settings/skills/view/:skillName", element: <SkillEditorPage /> },
      { path: "settings/models", element: <ModelConnectionsPage /> },
      { path: "settings/models/new", element: <ModelProviderCatalogPage /> },
      { path: "settings/models/new/:providerId", element: <ModelConnectionCreatePage /> },
      {
        path: "settings/models/:connectionId",
        element: <ModelConnectionDetailPage />
      },
      {
        index: true,
        element: <LaunchPage />
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
