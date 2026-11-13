import { useNavigation } from "@/app/navigation";
import {
  sessionAnalysisPath,
  sessionMapPath,
} from "@/features/sessions/routes";
import { workspaceOverviewPath } from "@/features/workspaces/routes";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import { LayoutDashboard, ListTree, Map, MessageCircle } from "lucide-vue-next";
import { computed, defineComponent } from "vue";
import { useRoute } from "vue-router";
import "./view-switcher.css";
const content = zhCN.sessionWorkspace;
export const WorkspaceViewSwitcher = defineComponent(
  (
    componentProps: {
      readonly workspaceId: string;
      readonly sessionId: string | null;
    },
    { slots: _slots },
  ) => {
    const workspaceId = computed(() => componentProps.workspaceId),
      sessionId = computed(() => componentProps.sessionId);
    const location = useRoute();
    const navigate = useNavigation();
    const activeSection = computed(() =>
      location.path.endsWith("/overview")
        ? "overview"
        : location.path.endsWith("/map")
          ? "map"
          : "analysis",
    );
    const trace = computed(() => location.path.endsWith("/analysis/trace"));
    const analysisAction = computed(() =>
      sessionId.value === null
        ? zhCN.overview.chooseSession
        : activeSection.value === "analysis" && !trace.value
          ? content.openTrace
          : content.openConversation,
    );
    function openAnalysis(mode: "conversation" | "trace") {
      if (sessionId.value !== null)
        void navigate(
          sessionAnalysisPath(workspaceId.value, sessionId.value, mode),
          {},
        );
    }
    function buttonClass(selected: boolean): string {
      return cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "bg-primary text-primary-foreground"
          : "text-secondary-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:pointer-events-none",
      );
    }
    return () => {
      const _activeSection = activeSection.value,
        _workspaceId = workspaceId.value,
        _sessionId = sessionId.value,
        _trace = trace.value,
        _analysisAction = analysisAction.value;
      return (
        <nav
          class="flex items-center gap-1 rounded-lg border border-border bg-background p-1"
          aria-label={content.viewNavigation}
        >
          <button
            type="button"
            class={buttonClass(_activeSection === "overview")}
            onClick={() =>
              void navigate(workspaceOverviewPath(_workspaceId), {
                state: {
                  sessionId: _sessionId,
                },
              })
            }
            aria-current={_activeSection === "overview" ? "page" : undefined}
            aria-label={content.overview}
            title={content.overview}
          >
            <LayoutDashboard class="size-4" strokeWidth={1.8} />
          </button>

          <button
            type="button"
            disabled={_sessionId === null}
            class={cn(
              buttonClass(_activeSection === "analysis"),
              "analysis-mode-toggle",
            )}
            data-mode={_trace ? "trace" : "conversation"}
            data-active={_activeSection === "analysis"}
            aria-pressed={_activeSection === "analysis" ? _trace : undefined}
            onClick={() =>
              openAnalysis(
                location.path.endsWith("/analysis/conversation")
                  ? "trace"
                  : "conversation",
              )
            }
            aria-current={_activeSection === "analysis" ? "page" : undefined}
            aria-label={_analysisAction}
            title={_analysisAction}
          >
            <span
              key={_trace ? "trace" : "conversation"}
              class="analysis-mode-light"
              aria-hidden="true"
            />
            <span class="analysis-mode-orbit" aria-hidden="true">
              <MessageCircle
                class="mode-conversation size-4"
                strokeWidth={1.9}
              />
              <ListTree class="mode-trace size-4" strokeWidth={1.9} />
            </span>
          </button>
          <button
            type="button"
            disabled={_sessionId === null}
            class={buttonClass(_activeSection === "map")}
            onClick={() =>
              _sessionId !== null &&
              void navigate(sessionMapPath(_workspaceId, _sessionId))
            }
            aria-current={_activeSection === "map" ? "page" : undefined}
            aria-label={content.map}
            title={
              _sessionId === null ? zhCN.overview.chooseSession : content.map
            }
          >
            <Map class="size-4" strokeWidth={1.8} />
          </button>
        </nav>
      );
    };
  },
  {
    name: "WorkspaceViewSwitcher",
    inheritAttrs: false,
    props: ["workspaceId", "sessionId"],
  },
);
