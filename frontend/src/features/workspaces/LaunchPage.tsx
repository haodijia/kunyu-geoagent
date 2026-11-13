import { ApiError } from "@/api/client";
import { useNavigation } from "@/app/navigation";
import { clearLastSessionRoute, readLastSessionRoute } from "@/app/storage";
import { Button } from "@/components/ui/button";
import { getSession, sessionQueryKeys } from "@/features/sessions/api";
import {
  parseSessionRoute,
  type SessionRoute,
} from "@/features/sessions/routes";
import { listWorkspaces, workspaceQueryKeys } from "@/features/workspaces/api";
import { WorkspaceStartPage } from "@/features/workspaces/WorkspaceStartPage";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQuery } from "@tanstack/vue-query";
import { computed, defineComponent, reactive, shallowRef } from "vue";
const content = zhCN.workspaceStart;
function readStoredRoute(): SessionRoute | null {
  const pathname = readLastSessionRoute();
  if (pathname === null) {
    return null;
  }
  const route = parseSessionRoute(pathname);
  if (route === null) {
    console.error("[navigation] Removing invalid stored session route.", {
      pathname,
    });
    clearLastSessionRoute();
  }
  return route;
}
export const LaunchPage = defineComponent(
  (_props, { slots: _slots }) => {
    const navigate = useNavigation();
    const storedRoute = shallowRef<SessionRoute | null>(readStoredRoute()),
      setStoredRoute = refSetter(storedRoute);
    const workspacesQuery = reactive(
      useQuery(
        computed(() => ({
          queryKey: workspaceQueryKeys.all,
          queryFn: listWorkspaces,
        })),
      ),
    );
    const sessionQuery = reactive(
      useQuery(
        computed(() => ({
          queryKey:
            storedRoute.value === null
              ? ["sessions", "restore", "none"]
              : sessionQueryKeys.detail(storedRoute.value.sessionId),
          queryFn: () => {
            if (storedRoute.value === null) {
              throw new Error(
                "A stored session route is required for restoration.",
              );
            }
            return getSession(storedRoute.value.sessionId);
          },
          enabled: storedRoute.value !== null,
        })),
      ),
    );
    watchMounted(
      [
        () => navigate,
        () => sessionQuery.data,
        () => sessionQuery.error,
        () => storedRoute.value,
        () => workspacesQuery.data,
      ],
      () => {
        if (storedRoute.value === null || workspacesQuery.data === undefined) {
          return;
        }
        if (
          sessionQuery.error instanceof ApiError &&
          sessionQuery.error.status === 404
        ) {
          clearLastSessionRoute();
          setStoredRoute(null);
          return;
        }
        if (sessionQuery.data === undefined) {
          return;
        }
        const workspaceExists = workspacesQuery.data.some(
          (workspace) => workspace.id === storedRoute.value?.workspaceId,
        );
        if (
          !workspaceExists ||
          sessionQuery.data.archived ||
          sessionQuery.data.workspace_id !== storedRoute.value.workspaceId
        ) {
          clearLastSessionRoute();
          setStoredRoute(null);
          return;
        }
        void navigate(storedRoute.value.pathname, {
          replace: true,
        });
      },
    );
    return () => {
      if (
        workspacesQuery.isPending ||
        (storedRoute.value !== null && sessionQuery.isPending)
      ) {
        return (
          <LaunchStatus
            message={
              storedRoute.value === null ? content.loading : content.restoring
            }
          />
        );
      }
      if (workspacesQuery.isError) {
        return (
          <LaunchError
            message={content.loadFailed}
            onRetry={() => void workspacesQuery.refetch()}
          />
        );
      }
      if (storedRoute.value !== null) {
        if (
          sessionQuery.isError &&
          !(
            sessionQuery.error instanceof ApiError &&
            sessionQuery.error.status === 404
          )
        ) {
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
    };
  },
  {
    name: "LaunchPage",
    inheritAttrs: false,
    props: [],
  },
);
const LaunchStatus = defineComponent(
  (
    componentProps: {
      readonly message: string;
    },
    { slots: _slots },
  ) => {
    const message = computed(() => componentProps.message);
    return () => {
      const _message = message.value;
      return (
        <div class="flex min-h-full items-center justify-center p-8 text-sm text-muted-foreground">
          {_message}
        </div>
      );
    };
  },
  {
    name: "LaunchStatus",
    inheritAttrs: false,
    props: ["message"],
  },
);
interface LaunchErrorProps {
  readonly message: string;
  readonly onRetry: () => void;
}
const LaunchError = defineComponent(
  (componentProps: LaunchErrorProps, { slots: _slots }) => {
    const message = computed(() => componentProps.message),
      onRetry = computed(() => componentProps.onRetry);
    return () => {
      const _message2 = message.value,
        _onRetry = onRetry.value;
      return (
        <div class="flex min-h-full items-center justify-center p-8">
          <div class="text-center">
            <p class="mt-0 mb-4 text-sm text-destructive" role="alert">
              {_message2}
            </p>
            <Button type="button" variant="outline" onClick={_onRetry}>
              {content.retry}
            </Button>
          </div>
        </div>
      );
    };
  },
  {
    name: "LaunchError",
    inheritAttrs: false,
    props: ["message", "onRetry"],
  },
);
