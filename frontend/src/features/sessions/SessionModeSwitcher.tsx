import { LayoutDashboard, ListTree, Map, MessageCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  sessionAnalysisPath,
  sessionMapPath,
  sessionOverviewPath,
} from "@/features/sessions/routes";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.sessionWorkspace;

export function SessionModeSwitcher() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSessionWorkspace();
  const activeSection = location.pathname.endsWith("/overview")
    ? "overview"
    : location.pathname.endsWith("/map")
      ? "map"
      : "analysis";

  function openAnalysis(mode: "conversation" | "trace") {
    void navigate(sessionAnalysisPath(session.workspace_id, session.id, mode));
  }

  function buttonClass(selected: boolean): string {
    return cn(
      "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      selected
        ? "bg-primary text-primary-foreground"
        : "text-secondary-foreground hover:bg-muted hover:text-foreground",
    );
  }

  return (
    <nav
      className="flex items-center gap-1 rounded-lg border border-border bg-background p-1"
      aria-label={content.viewNavigation}
    >
      <button
        type="button"
        className={buttonClass(activeSection === "overview")}
        onClick={() =>
          void navigate(sessionOverviewPath(session.workspace_id, session.id))
        }
        aria-current={activeSection === "overview" ? "page" : undefined}
        aria-label={content.overview}
        title={content.overview}
      >
        <LayoutDashboard className="size-4" strokeWidth={1.8} />
      </button>

      <button
        type="button"
        className={buttonClass(activeSection === "analysis")}
        onClick={() => openAnalysis(location.pathname.endsWith("/analysis/conversation") ? "trace" : "conversation")}
        aria-current={activeSection === "analysis" ? "page" : undefined}
        aria-label={location.pathname.endsWith("/analysis/conversation") ? content.openTrace : content.openConversation}
        title={location.pathname.endsWith("/analysis/conversation") ? content.openTrace : content.openConversation}
      >
        {location.pathname.endsWith("/analysis/trace")
          ? <ListTree className="size-4" strokeWidth={1.9} />
          : <MessageCircle className="size-4" strokeWidth={1.9} />}
      </button>
      <button
        type="button"
        className={buttonClass(activeSection === "map")}
        onClick={() =>
          void navigate(sessionMapPath(session.workspace_id, session.id))
        }
        aria-current={activeSection === "map" ? "page" : undefined}
        aria-label={content.map}
        title={content.map}
      >
        <Map className="size-4" strokeWidth={1.8} />
      </button>
    </nav>
  );
}
