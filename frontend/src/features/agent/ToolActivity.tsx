import { Down, Right } from "@icon-park/react";
import { useState } from "react";
import type { AgentTurnState, ToolCall } from "./api";
import type { Confirmation } from "@/features/confirmations/api";
import { zhCN } from "@/locales/zh-CN";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import type { GeneratingTool } from "@/features/events/stream-presentation";
import { ToolCallRow } from "./ToolCallRow";
import { ToolDetail, ToolKindIcon, ToolStatusBadge } from "./ToolActivityParts";
import { isWaitingQuestion, toolErrorLine, toolLabel, toolStatus, toolTarget } from "./tool-presentation";
import styles from "./ToolActivity.module.css";

const content = zhCN.conversation.tools;

export function GeneratingToolActivity({ tools }: { readonly tools: readonly GeneratingTool[] }) {
  return <div className={styles.summary} role="group" aria-label={content.generating}>
    {tools.map((tool) => <GeneratingToolRow key={tool.index} tool={tool} />)}
  </div>;
}

function GeneratingToolRow({ tool }: { readonly tool: GeneratingTool }) {
  const [expanded, setExpanded] = useState(false);
  const name = tool.name === null ? content.title : toolLabel(tool.name);
  return <div className={styles.call}>
    <button type="button" className={styles.callButton} aria-label={content.callAria(name, content.generating)} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
      <ToolStatusBadge status="running" label={content.generating} />
      {tool.name !== null && <ToolKindIcon name={tool.name} />}
      <span className={styles.callName}>{name}</span>
      <code className={styles.callPreview}>{tool.arguments}</code>
      {expanded ? <Down size={12} aria-hidden="true" /> : <Right size={12} aria-hidden="true" />}
    </button>
    {expanded && <div className={styles.detailPanel}><ToolDetail label={content.generating}>{tool.arguments}</ToolDetail></div>}
  </div>;
}

export function ToolActivity({ confirmations, tools, runState }: {
  readonly confirmations: readonly Confirmation[];
  readonly tools: readonly ToolCall[];
  readonly runState: AgentTurnState | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const { records } = useSessionEvents();
  if (tools.length === 0) return null;
  const calls = tools.map((tool) => {
    const confirmation = confirmations.find((item) => item.tool_call_id === tool.id);
    return { tool, confirmation, target: toolTarget(tool.arguments), status: toolStatus(tool, runState, confirmation) };
  });
  if (calls.length === 1) return <div className={styles.summary} role="group" aria-label={content.title}>
    <ToolCallRow tool={calls[0]!.tool} confirmation={calls[0]!.confirmation} runState={runState} />
  </div>;
  const waitingQuestion = calls.some(({ tool, status }) => status === "running" && isWaitingQuestion(tool, records));
  const running = calls.find(({ status }) => status === "running");
  const failed = calls.filter(({ status }) => status === "failed");
  const denied = calls.filter(({ status }) => status === "denied");
  const waiting = calls.find(({ status }) => status === "waiting");
  const pending = calls.find(({ status }) => status === "pending");
  const interrupted = calls.find(({ status }) => status === "interrupted");
  const unknown = calls.find(({ status }) => status === "unknown");
  const runningTarget = running === undefined ? undefined : running.target;
  const headline = waitingQuestion ? content.groupWaiting(tools.length, zhCN.questions.waiting)
    : running !== undefined ? content.groupRunning(tools.length, `${toolLabel(running.tool.name)}${runningTarget === undefined ? "" : ` ${runningTarget.text}`}`)
    : failed.length > 0 ? content.groupFailed(tools.length, failed.length)
    : waiting !== undefined ? content.groupWaiting(tools.length, content.confirmationStatus.pending)
    : pending !== undefined ? content.groupWaiting(tools.length, content.status.pending)
    : interrupted !== undefined ? content.groupWaiting(tools.length, content.status.interrupted)
    : unknown !== undefined ? content.groupWaiting(tools.length, content.status.unknown)
    : content.groupSummary(tools.length);
  const status = waitingQuestion ? "waiting" : running !== undefined ? "running" : failed.length > 0 ? "failed" : "pending";
  return <div className={styles.summary} role="group" aria-label={content.title}>
    <div className={styles.activity}>
      <button type="button" className={styles.activityHeader} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <ToolStatusBadge status={status} label={headline} />
        <span className={styles.activitySummary}>{headline}</span>
        {expanded ? <Down size={12} aria-hidden="true" /> : <Right size={12} aria-hidden="true" />}
      </button>
      {!expanded && failed.map(({ tool }) => <div key={tool.id} className={styles.activityError} data-tool-error={tool.id}>
        <span className={styles.callName}>{toolLabel(tool.name)}</span>
        <span className={styles.activityErrorLine} title={tool.error_summary === null ? undefined : tool.error_summary}>{toolErrorLine(tool)}</span>
      </div>)}
      {!expanded && denied.map(({ tool, target }) => <div key={tool.id} className={styles.activityError} data-tool-denied={tool.id}>
        <span className={styles.callName}>{toolLabel(tool.name)}</span>
        <span className={styles.activityDeniedLine}>{target === undefined ? "" : `${target.text} · `}{content.denied}</span>
      </div>)}
      {expanded && <div className={styles.activityBody}>
        {calls.map(({ tool, confirmation }) => <ToolCallRow key={tool.id} tool={tool} confirmation={confirmation} runState={runState} />)}
      </div>}
    </div>
  </div>;
}
