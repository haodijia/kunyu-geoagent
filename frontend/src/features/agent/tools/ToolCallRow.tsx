import type { AgentTurnState, ToolCall } from "@/features/agent/api";
import { parseToolDisplay } from "@/features/agent/tools/tool-output";
import {
  toolDuration,
  toolLabel,
  toolStatus,
  toolTarget,
} from "@/features/agent/tools/tool-presentation";
import styles from "@/features/agent/tools/ToolActivity.module.css";
import {
  ToolDetail,
  ToolKindIcon,
  ToolParameters,
  ToolStatusBadge,
  ToolTarget,
} from "@/features/agent/tools/ToolActivityParts";
import { ToolResultView } from "@/features/agent/tools/ToolResultView";
import { collectImageOffloads } from "@/features/attachments/image-offloads";
import type { Confirmation } from "@/features/confirmations/api";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { jobError, toolJob } from "@/features/jobs/job-state";
import { SubagentCard } from "@/features/subagents/SubagentCard";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { Down, Right } from "@icon-park/vue-next";
import { computed, defineComponent, shallowRef, toRefs } from "vue";
const content = zhCN.conversation.tools;
export const ToolCallRow = defineComponent(
  (
    componentProps: {
      readonly confirmation: Confirmation | undefined;
      readonly tool: ToolCall;
      readonly runState: AgentTurnState | null;
    },
    { slots: _slots },
  ) => {
    const confirmation = computed(() => componentProps.confirmation),
      tool = computed(() => componentProps.tool),
      runState = computed(() => componentProps.runState);
    const expanded = shallowRef(false),
      setExpanded = refSetter(expanded);
    const { records } = toRefs(useSessionEvents());
    const imageOffloads = computed(() => collectImageOffloads(records.value));
    if (
      tool.value.status === "completed" &&
      (tool.value.display === null || tool.value.compact === null)
    )
      throw new Error("Completed tool has no declared result projections.");
    const display = computed(() =>
      tool.value.status === "completed"
        ? parseToolDisplay(tool.value.display)
        : null,
    );
    const job = computed(() => toolJob(tool.value.id, records.value));
    const error = computed(() =>
      job.value?.status === "failed"
        ? jobError(job.value)
        : tool.value.error_summary,
    );
    const hasDetails = computed(
      () =>
        Object.keys(tool.value.arguments).length > 0 ||
        (display.value !== null && display.value.kind !== "none") ||
        error.value !== null ||
        confirmation.value !== undefined,
    );
    const duration = computed(() => toolDuration(tool.value.id, records.value));
    const status = computed(() =>
      toolStatus(tool.value, runState.value, confirmation.value, records.value),
    );
    const denied = computed(() => status.value === "denied");
    const waitingQuestion = computed(() => status.value === "waiting_input");
    const target = computed(() =>
      waitingQuestion.value
        ? {
            text: zhCN.questions.waiting,
            path: false,
          }
        : job.value !== undefined
          ? {
              text: `${job.value.label} · ${content.status[status.value]}`,
              path: false,
            }
          : !expanded.value && tool.value.compact !== null
            ? {
                text: tool.value.compact.summary,
                path: false,
              }
            : toolTarget(tool.value.arguments),
    );
    return () => {
      const _tool = tool.value,
        _waitingQuestion = waitingQuestion.value,
        _status = status.value,
        _hasDetails = hasDetails.value,
        _target = target.value,
        _duration = duration.value,
        _denied = denied.value,
        _error = error.value,
        _display = display.value,
        _imageOffloads = imageOffloads.value,
        _confirmation = confirmation.value;
      return (
        <div class={styles.call} data-tool-call={_tool.id}>
          <button
            type="button"
            class={styles.callButton}
            aria-label={content.callAria(
              toolLabel(_tool.name),
              _waitingQuestion
                ? zhCN.questions.waiting
                : content.status[_status],
            )}
            disabled={!_hasDetails}
            aria-expanded={_hasDetails ? expanded.value : undefined}
            onClick={() => setExpanded((value) => !value)}
          >
            <ToolStatusBadge status={_status} label={content.status[_status]} />
            <ToolKindIcon name={_tool.name} />
            <span class={styles.callName} title={toolLabel(_tool.name)}>
              {toolLabel(_tool.name)}
            </span>
            {_target !== undefined && (
              <span class={styles.separator} aria-hidden="true" />
            )}
            <ToolTarget target={_target} />
            {_duration !== null && (
              <span
                class={styles.callDuration}
                title={`${content.duration} · ${formatDuration(_duration)}`}
              >
                {formatDuration(_duration)}
              </span>
            )}
            {_hasDetails ? (
              expanded.value ? (
                <Down size={12} aria-hidden="true" />
              ) : (
                <Right size={12} aria-hidden="true" />
              )
            ) : null}
          </button>
          {!_denied && _status === "failed" && !expanded.value ? (
            <p class={styles.callError} title={_error ?? undefined}>
              {_error}
            </p>
          ) : null}
          {_tool.name === "subagent" && _tool.status !== "completed" && (
            <SubagentCard toolCallId={_tool.id} />
          )}
          {_denied && (
            <p class={styles.callDenied} data-tool-denied={_tool.id}>
              {content.denied}
            </p>
          )}
          {expanded.value ? (
            <div class={styles.detailPanel}>
              {_display !== null && (
                <ToolResultView
                  display={_display}
                  sessionId={_tool.session_id}
                  toolCallId={_tool.id}
                  offloadedIds={_imageOffloads.get(_tool.id)}
                />
              )}
              {!_denied && _error !== null ? (
                <ToolDetail label={content.error} danger text={_error} />
              ) : null}
              {Object.keys(_tool.arguments).length > 0 && (
                <ToolParameters arguments={_tool.arguments} />
              )}
              {_confirmation !== undefined && (
                <div class={styles.detailMetadata}>
                  <span>
                    {content.confirmation} ·{" "}
                    {content.confirmationStatus[_confirmation.status]}
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      );
    };
  },
  {
    name: "ToolCallRow",
    inheritAttrs: false,
    props: ["confirmation", "tool", "runState"],
  },
);
function formatDuration(milliseconds: number): string {
  return milliseconds < 1_000
    ? `${milliseconds} ms`
    : `${(milliseconds / 1_000).toFixed(2)} s`;
}
