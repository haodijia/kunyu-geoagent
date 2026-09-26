import { LayoutDashboard, ListTree, Map, MessageCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAppUiStore, type AnalysisMode } from "@/app/store";
import {
  sessionAnalysisPath,
  sessionMapPath,
  sessionOverviewPath
} from "@/features/sessions/routes";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.sessionWorkspace;

export function SessionModeSwitcher() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSessionWorkspace();
  const rememberedMode = useAppUiStore(
    (state) => state.analysisModeBySession[session.id] ?? "conversation"
  );
  const setAnalysisMode = useAppUiStore((state) => state.setAnalysisMode);
  const activeSection = location.pathname.endsWith("/overview")
    ? "overview"
    : location.pathname.endsWith("/map")
      ? "map"
      : "analysis";

  function openAnalysis(mode: "conversation" | "trace") {
    setAnalysisMode(session.id, mode);
    void navigate(sessionAnalysisPath(session.workspace_id, session.id, mode));
  }

  function analysisModeTextClass(mode: AnalysisMode): string {
    if (rememberedMode !== mode) {
      return "text-slate-500 hover:text-slate-800";
    }
    return activeSection === "analysis" ? "text-white" : "text-slate-950";
  }

  return (
    <nav
      className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      aria-label={content.viewNavigation}
    >
      <button
        type="button"
        className={cn(
          "flex size-8 items-center justify-center rounded-lg transition-colors",
          activeSection === "overview"
            ? "bg-slate-900 text-white"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
        )}
        onClick={() =>
          void navigate(sessionOverviewPath(session.workspace_id, session.id))
        }
        aria-current={activeSection === "overview" ? "page" : undefined}
        aria-label={content.overview}
        title={content.overview}
      >
        <LayoutDashboard className="size-4" strokeWidth={1.8} />
      </button>

      <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />

      <div
        className={cn(
          "relative grid grid-cols-2 rounded-lg bg-slate-100 transition-colors",
          activeSection === "analysis" && "bg-slate-200"
        )}
        aria-label={content.analysisMode}
      >
        <span
          className={cn(
            "pointer-events-none absolute top-0 left-0 size-8 rounded-lg shadow-sm transition-[color,background-color,transform] duration-200 ease-out",
            activeSection === "analysis" ? "bg-slate-900" : "bg-white",
            rememberedMode === "trace" && "translate-x-8"
          )}
          aria-hidden="true"
        />
        <button
          type="button"
          className={cn(
            "relative z-10 flex size-8 items-center justify-center rounded-lg transition-colors",
            analysisModeTextClass("conversation")
          )}
          onClick={() => openAnalysis("conversation")}
          aria-pressed={
            activeSection === "analysis" && rememberedMode === "conversation"
          }
          aria-label={content.conversation}
          title={content.conversation}
        >
          <MessageCircle className="size-4" strokeWidth={1.9} />
        </button>
        <button
          type="button"
          className={cn(
            "relative z-10 flex size-8 items-center justify-center rounded-lg transition-colors",
            analysisModeTextClass("trace")
          )}
          onClick={() => openAnalysis("trace")}
          aria-pressed={activeSection === "analysis" && rememberedMode === "trace"}
          aria-label={content.trace}
          title={content.trace}
        >
          <ListTree className="size-4" strokeWidth={1.9} />
        </button>
      </div>

      <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />

      <button
        type="button"
        className={cn(
          "flex size-8 items-center justify-center rounded-lg transition-colors",
          activeSection === "map"
            ? "bg-slate-900 text-white"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
        )}
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
