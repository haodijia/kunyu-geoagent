import { OutputCard } from "@/features/analysis/OutputCard";
import { useAnalysisOutputs } from "@/features/analysis/useAnalysis";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { jobById, jobError } from "@/features/jobs/job-state";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { computed, defineComponent, toRefs } from "vue";
const content = zhCN.analysis;
export const AnalysisResult = defineComponent(
  (
    componentProps: {
      readonly jobId: string;
    },
    { slots: _slots },
  ) => {
    const jobId = computed(() => componentProps.jobId);
    const session = useSessionWorkspace();
    const { records } = toRefs(useSessionEvents());
    const outputs = useAnalysisOutputs(() => session.workspace_id);
    const output = computed(() =>
      outputs.data?.find((item) => item.job_id === jobId.value),
    );
    const job = computed(() => jobById(jobId.value, records.value));
    const status = computed(() =>
      job.value?.status === "killed"
        ? "cancelled"
        : job.value?.status === "stopping"
          ? "running"
          : job.value?.status,
    );
    const error = computed(() => jobError(job.value));
    return () => {
      const _output = output.value,
        _job = job.value,
        _status = status.value,
        _error = error.value;
      if (outputs.isError)
        return (
          <p role="alert" class="text-xs text-destructive">
            {content.loadFailed}
          </p>
        );
      if (outputs.isPending)
        return (
          <p role="status" class="text-xs text-muted-foreground">
            {content.loading}
          </p>
        );
      if (_output !== undefined)
        return (
          <OutputCard
            key={_output.id}
            output={_output}
            workspaceId={session.workspace_id}
            sessionId={session.id}
            compact
          />
        );
      if (_job === undefined)
        return (
          <p role="status" class="text-xs text-muted-foreground">
            {content.loading}
          </p>
        );
      return (
        <div class="space-y-1 text-xs" role="status">
          <p class="text-muted-foreground">
            {zhCN.conversation.tools.status[_status!]} ·{" "}
            {zhCN.conversation.tools.jobStages[_job.stage]}
          </p>
          {_job.detail !== null && <p class="text-warning">{_job.detail}</p>}
          {_error !== null && (
            <p role="alert" class="text-destructive">
              {_error}
            </p>
          )}
          {_job.status === "completed" && (
            <p class="text-muted-foreground">{content.loading}</p>
          )}
        </div>
      );
    };
  },
  {
    name: "AnalysisResult",
    inheritAttrs: false,
    props: ["jobId"],
  },
);
