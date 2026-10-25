import "./view-switcher.css";
import { LayoutDashboard, ListTree, Map, MessageCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  sessionAnalysisPath,
  sessionMapPath,
} from "@/features/sessions/routes";
import { workspaceOverviewPath } from "@/features/workspaces/routes";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.sessionWorkspace;

export function WorkspaceViewSwitcher({
  workspaceId,
  sessionId,
}: {
  readonly workspaceId: string;
  readonly sessionId: string | null;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSection = location.pathname.endsWith("/overview")
    ? "overview"
    : location.pathname.endsWith("/map")
      ? "map"
      : "analysis";

  const trace = location.pathname.endsWith("/analysis/trace");
  const analysisAction =
    sessionId === null
      ? zhCN.overview.chooseSession
      : activeSection === "analysis" && !trace
        ? content.openTrace
        : content.openConversation;

  function openAnalysis(mode: "conversation" | "trace") {
    if (sessionId !== null)
      void navigate(sessionAnalysisPath(workspaceId, sessionId, mode), {
        viewTransition: activeSection === "analysis",
      });
  }

  function buttonClass(selected: boolean): string {
    return cn(
      "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      selected
        ? "bg-primary text-primary-foreground"
        : "text-secondary-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:pointer-events-none",
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
          void navigate(workspaceOverviewPath(workspaceId), {
            state: { sessionId },
          })
        }
        aria-current={activeSection === "overview" ? "page" : undefined}
        aria-label={content.overview}
        title={content.overview}
      >
        <LayoutDashboard className="size-4" strokeWidth={1.8} />
      </button>

      <button
        type="button"
        disabled={sessionId === null}
        className={cn(
          buttonClass(activeSection === "analysis"),
          "analysis-mode-toggle",
        )}
        data-mode={trace ? "trace" : "conversation"}
        data-active={activeSection === "analysis"}
        aria-pressed={activeSection === "analysis" ? trace : undefined}
        onClick={() =>
          openAnalysis(
            location.pathname.endsWith("/analysis/conversation")
              ? "trace"
              : "conversation",
          )
        }
        aria-current={activeSection === "analysis" ? "page" : undefined}
        aria-label={analysisAction}
        title={analysisAction}
      >
        <span
          key={trace ? "trace" : "conversation"}
          className="analysis-mode-light"
          aria-hidden="true"
        />
        <span className="analysis-mode-orbit" aria-hidden="true">
          <MessageCircle
            className="mode-conversation size-4"
            strokeWidth={1.9}
          />
          <ListTree className="mode-trace size-4" strokeWidth={1.9} />
        </span>
      </button>
      <button
        type="button"
        disabled={sessionId === null}
        className={buttonClass(activeSection === "map")}
        onClick={() =>
          sessionId !== null &&
          void navigate(sessionMapPath(workspaceId, sessionId))
        }
        aria-current={activeSection === "map" ? "page" : undefined}
        aria-label={content.map}
        title={sessionId === null ? zhCN.overview.chooseSession : content.map}
      >
        <Map className="size-4" strokeWidth={1.8} />
      </button>
    </nav>
  );
}
