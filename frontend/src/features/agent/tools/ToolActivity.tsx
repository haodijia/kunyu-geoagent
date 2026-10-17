import type { AgentTurnState, ToolCall } from "@/features/agent/api";
import { toolLabel } from "@/features/agent/tools/tool-presentation";
import styles from "@/features/agent/tools/ToolActivity.module.css";
import {
  ToolDetail,
  ToolKindIcon,
  ToolStatusBadge,
} from "@/features/agent/tools/ToolActivityParts";
import { ToolCallRow } from "@/features/agent/tools/ToolCallRow";
import type { Confirmation } from "@/features/confirmations/api";
import type { GeneratingTool } from "@/features/events/stream/stream-presentation";
import { zhCN } from "@/locales/zh-CN";
import { Down, Right } from "@icon-park/react";
import { useState } from "react";

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
  if (tools.length === 0) return null;
  return <div className={styles.summary} role="group" aria-label={content.title}>
    {tools.map((tool) => <ToolCallRow
      key={tool.id}
      tool={tool}
      confirmation={confirmations.find((item) => item.tool_call_id === tool.id)}
      runState={runState}
    />)}
  </div>;
}
