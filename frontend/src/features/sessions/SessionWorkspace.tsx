import { ApiError } from "@/api/client";
import { Navigate } from "@/app/navigation";
import { clearLastSessionRoute, writeLastSessionRoute } from "@/app/storage";
import { useAppUiStore, type AnalysisMode } from "@/app/store";
import { AnalysisEventsBridge } from "@/features/analysis/AnalysisEventsBridge";
import { SessionEventProvider } from "@/features/events/SessionEventContext";
import { MapPresentationBridge } from "@/features/maps/layers/MapPresentationBridge";
import { MessageNavigationProvider } from "@/features/messages/navigation/MessageNavigationContext";
import { SessionMessagesProvider } from "@/features/messages/state/SessionMessagesContext";
import { PlanDocumentProvider } from "@/features/plans/PlanDocument";
import { getSession, sessionQueryKeys } from "@/features/sessions/api";
import { parseSessionRoute } from "@/features/sessions/routes";
import { SessionTitlebar } from "@/features/sessions/SessionTitlebar";
import { SessionWorkspaceProvider } from "@/features/sessions/SessionWorkspaceContext";
import { SubagentProvider } from "@/features/subagents/SubagentContext";
import { watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQuery } from "@tanstack/vue-query";
import { computed, defineComponent, reactive } from "vue";
import { RouterView, useRoute } from "vue-router";
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
export const SessionWorkspace = defineComponent(
  (_props, { slots: _slots }) => {
    const _route = useRoute(),
      sessionId = computed(() =>
        _route.params.sessionId === undefined
          ? undefined
          : String(_route.params.sessionId),
      ),
      workspaceId = computed(() =>
        _route.params.workspaceId === undefined
          ? undefined
          : String(_route.params.workspaceId),
      );
    return () => {
      const _sessionId = sessionId.value,
        _workspaceId = workspaceId.value;
      if (_sessionId === undefined || _workspaceId === undefined)
        throw new Error("Session workspace route parameters are required.");
      return (
        <SessionWorkspaceContent
          sessionId={_sessionId}
          workspaceId={_workspaceId}
        />
      );
    };
  },
  {
    name: "SessionWorkspace",
    inheritAttrs: false,
    props: [],
  },
);
interface SessionWorkspaceContentProps {
  readonly sessionId: string;
  readonly workspaceId: string;
}
const SessionWorkspaceContent = defineComponent(
  (componentProps: SessionWorkspaceContentProps, { slots: _slots }) => {
    const sessionId = computed(() => componentProps.sessionId),
      workspaceId = computed(() => componentProps.workspaceId);
    const location = useRoute();
    const setAnalysisMode = computed(() =>
      ((state) => state.setAnalysisMode)(useAppUiStore()),
    );
    const initializeMapContext = computed(() =>
      ((state) => state.initializeMapContext)(useAppUiStore()),
    );
    const sessionQuery = reactive(
      useQuery(
        computed(() => ({
          queryKey: sessionQueryKeys.detail(sessionId.value),
          queryFn: () => getSession(sessionId.value),
        })),
      ),
    );
    const analysisMode = computed(() => routeAnalysisMode(location.path));
    watchMounted(
      [
        () => initializeMapContext.value,
        () => sessionId.value,
        () => workspaceId.value,
      ],
      () => {
        initializeMapContext.value(sessionId.value, workspaceId.value);
      },
    );
    watchMounted(
      [
        () => analysisMode.value,
        () => sessionId.value,
        () => setAnalysisMode.value,
      ],
      () => {
        if (analysisMode.value !== null) {
          setAnalysisMode.value(sessionId.value, analysisMode.value);
        }
      },
    );
    watchMounted(
      [() => location.path, () => sessionQuery.data, () => workspaceId.value],
      () => {
        if (
          sessionQuery.data !== undefined &&
          sessionQuery.data.workspace_id === workspaceId.value &&
          !sessionQuery.data.archived &&
          parseSessionRoute(location.path) !== null
        ) {
          writeLastSessionRoute(location.path);
        }
      },
    );
    return () => {
      const _workspaceId2 = workspaceId.value;
      if (sessionQuery.isPending) {
        return (
          <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
            {content.loading}
          </div>
        );
      }
      if (sessionQuery.isError) {
        if (
          sessionQuery.error instanceof ApiError &&
          sessionQuery.error.status === 404
        ) {
          return <InvalidSessionRedirect />;
        }
        return (
          <div
            class="flex h-full items-center justify-center px-8 text-center text-sm text-destructive"
            role="alert"
          >
            {sessionQuery.error.message}
          </div>
        );
      }
      if (sessionQuery.data.workspace_id !== _workspaceId2) {
        return <InvalidSessionRedirect />;
      }
      return (
        <SessionWorkspaceProvider session={sessionQuery.data}>
          <SessionEventProvider
            key={sessionQuery.data.id}
            sessionId={sessionQuery.data.id}
          >
            <AnalysisEventsBridge
              sessionId={sessionQuery.data.id}
              workspaceId={_workspaceId2}
            />
            <MapPresentationBridge />
            <SessionMessagesProvider
              sessionId={sessionQuery.data.id}
              workspaceId={sessionQuery.data.workspace_id}
            >
              <PlanDocumentProvider
                key={sessionQuery.data.id}
                sessionId={sessionQuery.data.id}
              >
                <MessageNavigationProvider>
                  <SubagentProvider>
                    <section class="flex h-full min-h-0 flex-col bg-background">
                      <SessionTitlebar />
                      <div class="session-analysis-surface min-h-0 flex-1 overflow-hidden">
                        <RouterView />
                      </div>
                    </section>
                  </SubagentProvider>
                </MessageNavigationProvider>
              </PlanDocumentProvider>
            </SessionMessagesProvider>
          </SessionEventProvider>
        </SessionWorkspaceProvider>
      );
    };
  },
  {
    name: "SessionWorkspaceContent",
    inheritAttrs: false,
    props: ["sessionId", "workspaceId"],
  },
);
const InvalidSessionRedirect = defineComponent(
  (_props, { slots: _slots }) => {
    watchMounted([], () => {
      clearLastSessionRoute();
    });
    return () => {
      return <Navigate to="/" replace />;
    };
  },
  {
    name: "InvalidSessionRedirect",
    inheritAttrs: false,
    props: [],
  },
);
