import { Button } from "@/components/ui/button";
import { analysisApi, analysisKeys } from "@/features/analysis/api";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";
import { useQuery } from "@tanstack/vue-query";
import { FolderClosed } from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef, Teleport } from "vue";
import { useRoute } from "vue-router";
import { WorkspaceResults } from "./WorkspaceResults";
import { WorkspaceViewSwitcher } from "./WorkspaceViewSwitcher";
import { getWorkspace, listSessions, workspaceQueryKeys } from "./api";
import { WorkspaceFileBrowser } from "./files/WorkspaceFileBrowser";
import { WorkspaceKnowledge } from "./overview/WorkspaceKnowledge";
import { WorkspaceMetrics } from "./overview/WorkspaceMetrics";
import { getOverview, overviewKey } from "./overview/overview-api";
import "./overview/overview.css";
export const WorkspaceOverview = defineComponent(
  (_props, { slots: _slots }) => {
    const _route = useRoute(),
      workspaceId = computed(() =>
        _route.params.workspaceId === undefined
          ? undefined
          : String(_route.params.workspaceId),
      );
    return () => {
      const _workspaceId = workspaceId.value;
      if (_workspaceId === undefined)
        throw new Error("Workspace overview requires a workspace identifier.");
      return (
        <WorkspaceOverviewContent
          key={_workspaceId}
          workspaceId={_workspaceId}
        />
      );
    };
  },
  {
    name: "WorkspaceOverview",
    inheritAttrs: false,
    props: [],
  },
);
const WorkspaceOverviewContent = defineComponent(
  (
    componentProps: {
      readonly workspaceId: string;
    },
    { slots: _slots },
  ) => {
    const workspaceId = computed(() => componentProps.workspaceId);
    const originSessionId = computed<unknown>(
      () => window.history.state?.sessionId,
    );
    const selectedOutputId = shallowRef<string | null>(null),
      setSelectedOutputId = refSetter(selectedOutputId);
    const fileLocation = shallowRef<{
        path: string;
      } | null>(null),
      setFileLocation = refSetter(fileLocation);
    const workspace = reactive(
      useQuery(
        computed(() => ({
          queryKey: workspaceQueryKeys.detail(workspaceId.value),
          queryFn: () => getWorkspace(workspaceId.value),
        })),
      ),
    );
    const sessions = reactive(
      useQuery(
        computed(() => ({
          queryKey: workspaceQueryKeys.sessions(workspaceId.value),
          queryFn: () => listSessions(workspaceId.value),
        })),
      ),
    );
    const outputs = reactive(
      useQuery(
        computed(() => ({
          queryKey: analysisKeys.outputs(workspaceId.value),
          queryFn: () => analysisApi.outputs(workspaceId.value),
          refetchInterval: 5000,
        })),
      ),
    );
    const overview = reactive(
      useQuery(
        computed(() => ({
          queryKey: overviewKey(workspaceId.value),
          queryFn: ({ signal }: { signal: AbortSignal }) =>
            getOverview(workspaceId.value, signal),
          refetchInterval: 5000,
        })),
      ),
    );
    const originSession = computed(() =>
      sessions.data?.find((session) => session.id === originSessionId.value),
    );
    const outputCount = computed(() => outputs.data?.length);
    return () => {
      const _workspaceId2 = workspaceId.value,
        _originSession = originSession.value,
        _outputCount = outputCount.value;
      if (workspace.isPending)
        return (
          <p class="overview-message" role="status">
            {copy.loading}
          </p>
        );
      if (workspace.isError)
        return (
          <p class="overview-message text-destructive" role="alert">
            {workspace.error.message}
          </p>
        );
      return (
        <section class="workspace-overview" aria-label="工作区总览">
          <WorkspaceOverviewTitlebar
            workspaceId={_workspaceId2}
            name={workspace.data.name}
            sessionId={_originSession?.id ?? null}
          />
          <header class="overview-page-heading">
            <div class="min-w-0">
              <div class="overview-eyebrow">{copy.eyebrow}</div>
              <h1>{workspace.data.name}</h1>
              <p>{copy.subtitle}</p>
            </div>
            <div class="overview-workspace-counts">
              <span>
                <strong>{sessions.data?.length ?? "—"}</strong>
                {copy.sessions}
              </span>
              <span>
                <strong>{_outputCount ?? "—"}</strong>
                {copy.resultUnit}
              </span>
            </div>
          </header>
          <div class="overview-grid">
            <WorkspaceFileBrowser
              workspace={workspace.data}
              outputs={outputs.data ?? []}
              sessionId={_originSession?.id ?? null}
              location={fileLocation.value}
              onSelectOutput={setSelectedOutputId}
            />
            {outputs.isSuccess ? (
              <WorkspaceResults
                outputs={outputs.data}
                workspaceId={_workspaceId2}
                sessions={sessions.data ?? []}
                originSessionId={_originSession?.id ?? null}
                selectedId={selectedOutputId.value}
                onSelect={setSelectedOutputId}
                onLocate={(path) =>
                  setFileLocation({
                    path,
                  })
                }
              />
            ) : (
              <OverviewQueryState
                title={copy.results}
                error={outputs.error}
                retry={() => void outputs.refetch()}
              />
            )}
            {overview.isSuccess ? (
              <WorkspaceMetrics metrics={overview.data.metrics} />
            ) : (
              <OverviewQueryState
                title={copy.metrics}
                error={overview.error}
                retry={() => void overview.refetch()}
              />
            )}
            {overview.isSuccess ? (
              <WorkspaceKnowledge
                workspaceId={_workspaceId2}
                memories={overview.data.memories}
                count={overview.data.memory_count}
              />
            ) : (
              <OverviewQueryState
                title={copy.knowledge}
                error={overview.error}
                retry={() => void overview.refetch()}
              />
            )}
          </div>
          {sessions.isError && (
            <p class="text-xs text-destructive" role="alert">
              {sessions.error.message}
            </p>
          )}
        </section>
      );
    };
  },
  {
    name: "WorkspaceOverviewContent",
    inheritAttrs: false,
    props: ["workspaceId"],
  },
);
const OverviewQueryState = defineComponent(
  (
    componentProps: {
      readonly title: string;
      readonly error: Error | null;
      readonly retry: () => void;
    },
    { slots: _slots },
  ) => {
    const title = computed(() => componentProps.title),
      error = computed(() => componentProps.error),
      retry = computed(() => componentProps.retry);
    return () => {
      const _title = title.value,
        _error = error.value,
        _retry = retry.value;
      return (
        <section class="overview-panel">
          <header class="overview-panel-heading">
            <h2>{_title}</h2>
          </header>
          <div
            class="overview-empty"
            role={_error === null ? "status" : "alert"}
          >
            <p>{_error?.message ?? copy.loading}</p>
            {_error !== null && (
              <Button variant="outline" size="sm" onClick={_retry}>
                {copy.retry}
              </Button>
            )}
          </div>
        </section>
      );
    };
  },
  {
    name: "OverviewQueryState",
    inheritAttrs: false,
    props: ["title", "error", "retry"],
  },
);
const WorkspaceOverviewTitlebar = defineComponent(
  (
    componentProps: {
      readonly workspaceId: string;
      readonly name: string;
      readonly sessionId: string | null;
    },
    { slots: _slots },
  ) => {
    const workspaceId = computed(() => componentProps.workspaceId),
      name = computed(() => componentProps.name),
      sessionId = computed(() => componentProps.sessionId);
    const targets = shallowRef<{
        title: HTMLElement;
        mode: HTMLElement;
      } | null>(null),
      setTargets = refSetter(targets);
    watchMounted([], () => {
      const title = document.getElementById("session-titlebar-title-slot");
      const mode = document.getElementById("session-titlebar-mode-slot");
      if (title === null || mode === null)
        throw new Error("Workspace titlebar slots are required.");
      setTargets({
        title,
        mode,
      });
    });
    return () => {
      const _name = name.value,
        _workspaceId3 = workspaceId.value,
        _sessionId = sessionId.value;
      if (targets.value === null) return null;
      return (
        <>
          {
            <Teleport to={targets.value.title}>
              {
                <div class="pointer-events-auto flex min-w-0 items-center gap-2 text-base font-semibold">
                  <FolderClosed class="size-[18px] shrink-0" />
                  <span class="truncate">{_name}</span>
                </div>
              }
            </Teleport>
          }
          {
            <Teleport to={targets.value.mode}>
              {
                <WorkspaceViewSwitcher
                  workspaceId={_workspaceId3}
                  sessionId={_sessionId}
                />
              }
            </Teleport>
          }
        </>
      );
    };
  },
  {
    name: "WorkspaceOverviewTitlebar",
    inheritAttrs: false,
    props: ["workspaceId", "name", "sessionId"],
  },
);
