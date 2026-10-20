import type { AgentTurnState, ToolCall } from "@/features/agent/api";
import { ToolResultView } from "@/features/agent/tools/ToolResultView";
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
import { collectImageOffloads } from "@/features/attachments/image-offloads";
import type { Confirmation } from "@/features/confirmations/api";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { jobError, toolJob } from "@/features/jobs/job-state";
import { SubagentCard } from "@/features/subagents/SubagentCard";
import { zhCN } from "@/locales/zh-CN";
import { Down, Right } from "@icon-park/react";
import { useMemo, useState } from "react";

const content = zhCN.conversation.tools;

export function ToolCallRow({
  confirmation,
  tool,
  runState,
}: {
  readonly confirmation: Confirmation | undefined;
  readonly tool: ToolCall;
  readonly runState: AgentTurnState | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const { records } = useSessionEvents();
  const imageOffloads = useMemo(() => collectImageOffloads(records), [records]);
  if (tool.status === "completed" && (tool.display === null || tool.compact === null))
    throw new Error("Completed tool has no declared result projections.");
  const display = tool.status === "completed" ? parseToolDisplay(tool.display) : null;
  const job = toolJob(tool.id, records);
  const error = job?.status === "failed" ? jobError(job) : tool.error_summary;
  const hasDetails =
    Object.keys(tool.arguments).length > 0 ||
    (display !== null && display.kind !== "none") ||
    error !== null ||
    confirmation !== undefined;
  const duration = toolDuration(tool.id, records);
  const status = toolStatus(tool, runState, confirmation, records);
  const denied = status === "denied";
  const waitingQuestion = status === "waiting_input";
  const target = waitingQuestion ? { text: zhCN.questions.waiting, path: false }
    : job !== undefined ? { text: `${job.label} · ${content.status[status]}`, path: false }
    : !expanded && tool.compact !== null ? { text: tool.compact.summary, path: false }
    : toolTarget(tool.arguments);

  return (
    <div className={styles.call} data-tool-call={tool.id}>
      <button
        type="button"
        className={styles.callButton}
        aria-label={content.callAria(toolLabel(tool.name), waitingQuestion ? zhCN.questions.waiting : content.status[status])}
        disabled={!hasDetails}
        aria-expanded={hasDetails ? expanded : undefined}
        onClick={() => setExpanded((value) => !value)}
      >
        <ToolStatusBadge status={status} label={content.status[status]} />
        <ToolKindIcon name={tool.name} />
        <span
          className={styles.callName}
          title={toolLabel(tool.name)}
        >
          {toolLabel(tool.name)}
        </span>
        {target !== undefined && <span className={styles.separator} aria-hidden="true" />}
        <ToolTarget target={target} />
        {duration !== null && <span className={styles.callDuration} title={`${content.duration} · ${formatDuration(duration)}`}>
          {formatDuration(duration)}
        </span>}
        {hasDetails ? (
          expanded ? (
            <Down size={12} aria-hidden="true" />
          ) : (
            <Right size={12} aria-hidden="true" />
          )
        ) : null}
      </button>
      {!denied && status === "failed" && !expanded ? (
        <p className={styles.callError} title={error ?? undefined}>
          {error}
        </p>
      ) : null}
      {tool.name === "subagent" && tool.status !== "completed" && <SubagentCard toolCallId={tool.id} />}
      {denied && <p className={styles.callDenied} data-tool-denied={tool.id}>{content.denied}</p>}
      {expanded ? (
        <div className={styles.detailPanel}>
          {display !== null && <ToolResultView display={display} sessionId={tool.session_id} toolCallId={tool.id} offloadedIds={imageOffloads.get(tool.id)} />}
          {!denied && error !== null ? (
            <ToolDetail label={content.error} danger>
              {error}
            </ToolDetail>
          ) : null}
          {Object.keys(tool.arguments).length > 0 && <ToolParameters arguments={tool.arguments} />}
          {confirmation !== undefined && <div className={styles.detailMetadata}>
            <span>
              {content.confirmation} ·{" "}
              {content.confirmationStatus[confirmation.status]}
            </span>
          </div>}
        </div>
      ) : null}
    </div>
  );
}

function formatDuration(milliseconds: number): string {
  return milliseconds < 1_000
    ? `${milliseconds} ms`
    : `${(milliseconds / 1_000).toFixed(2)} s`;
}
