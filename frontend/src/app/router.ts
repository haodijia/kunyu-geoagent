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
import { createRouter, createWebHashHistory } from "vue-router";
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      component: AppShell,
      children: [
        {
          path: "",
          component: LaunchPage,
        },
        {
          path: "settings/storage",
          component: StorageSettingsPage,
        },
        {
          path: "settings/oge",
          component: OgeSettingsPage,
        },
        {
          path: "settings/mcp",
          component: McpServersPage,
        },
        {
          path: "settings/mcp/new",
          component: McpServerEditorPage,
        },
        {
          path: "settings/mcp/:serverName",
          component: McpServerEditorPage,
        },
        {
          path: "settings/archived",
          component: ArchivedSessionsPage,
        },
        {
          path: "settings/skills",
          component: SkillsPage,
        },
        {
          path: "settings/skills/new",
          component: SkillEditorPage,
        },
        {
          path: "settings/skills/view/:skillName",
          component: SkillEditorPage,
        },
        {
          path: "settings/models",
          component: ModelConnectionsPage,
        },
        {
          path: "settings/models/new",
          component: ModelProviderCatalogPage,
        },
        {
          path: "settings/models/new/:providerId",
          component: ModelConnectionCreatePage,
        },
        {
          path: "settings/models/:connectionId",
          component: ModelConnectionDetailPage,
        },
        {
          path: "workspaces/:workspaceId/overview",
          component: WorkspaceOverview,
        },
        {
          path: "workspaces/:workspaceId/sessions/:sessionId",
          component: SessionWorkspace,
          children: [
            {
              path: "",
              redirect: (to) => to.path + "/analysis/conversation",
            },
            {
              path: "analysis",
              redirect: (to) =>
                to.path +
                "/" +
                (useAppUiStore().analysisModeBySession[
                  String(to.params.sessionId)
                ] ?? "conversation"),
            },
            {
              path: "analysis/conversation",
              component: ConversationView,
            },
            {
              path: "analysis/trace",
              component: () =>
                import("@/features/sessions/views/TraceView").then(
                  (m) => m.TraceView,
                ),
            },
            {
              path: "map",
              component: () =>
                import("@/features/sessions/views/MapView").then(
                  (m) => m.MapView,
                ),
            },
          ],
        },
        {
          path: ":pathMatch(.*)*",
          redirect: "/",
        },
      ],
    },
  ],
});
