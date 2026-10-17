import { Navigate, createHashRouter, useParams } from "react-router-dom";

import { AppShell } from "@/app/AppShell";
import { useAppUiStore } from "@/app/store";
import { ArchivedSessionsPage } from "@/features/sessions/archive/ArchivedSessionsPage";
import { SessionWorkspace } from "@/features/sessions/SessionWorkspace";
import { ConversationView } from "@/features/sessions/views/ConversationView";
import { McpServerEditorPage } from "@/features/settings/mcp/McpServerEditorPage";
import { McpServersPage } from "@/features/settings/mcp/McpServersPage";
import { ModelConnectionCreatePage } from "@/features/settings/models/ModelConnectionCreatePage";
import { ModelConnectionDetailPage } from "@/features/settings/models/ModelConnectionDetailPage";
import { ModelConnectionsPage } from "@/features/settings/models/ModelConnectionsPage";
import { ModelProviderCatalogPage } from "@/features/settings/models/ModelProviderCatalogPage";
import { OgeSettingsPage } from "@/features/settings/oge/OgeSettingsPage";
import { SkillEditorPage } from "@/features/settings/skills/SkillEditorPage";
import { SkillsPage } from "@/features/settings/skills/SkillsPage";
import { StorageSettingsPage } from "@/features/settings/StorageSettingsPage";
import { LaunchPage } from "@/features/workspaces/LaunchPage";
import { WorkspaceOverview } from "@/features/workspaces/WorkspaceOverview";

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
      { path: "settings/storage", element: <StorageSettingsPage /> },
      { path: "settings/oge", element: <OgeSettingsPage /> },
      { path: "settings/mcp", element: <McpServersPage /> },
      { path: "settings/mcp/new", element: <McpServerEditorPage /> },
      { path: "settings/mcp/:serverName", element: <McpServerEditorPage /> },
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
      { path: "workspaces/:workspaceId/overview", element: <WorkspaceOverview /> },
      {
        path: "workspaces/:workspaceId/sessions/:sessionId",
        element: <SessionWorkspace />,
        children: [
          {
            index: true,
            element: <Navigate to="analysis/conversation" replace />
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
