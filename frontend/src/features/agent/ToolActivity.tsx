import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  LoaderCircle,
  Wrench,
  X
} from "lucide-react";
import { useState, type ReactNode } from "react";

import type { ToolCall } from "@/features/agent/api";
import type { Confirmation } from "@/features/confirmations/api";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.conversation.tools;

export function ToolActivity({
  confirmations,
  tools
}: {
  readonly confirmations: readonly Confirmation[];
  readonly tools: readonly ToolCall[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (tools.length === 0) return null;
  if (tools.length === 1) {
    return <ToolCallRow confirmation={confirmationFor(tools[0]!, confirmations)} tool={tools[0]!} />;
  }

  const runningTool = tools.find((tool) =>
    tool.status === "pending" || tool.status === "running"
  );
  const failedCount = tools.filter((tool) => tool.status === "failed").length;
  const summary = runningTool === undefined
    ? failedCount > 0
      ? content.groupFailed(tools.length, failedCount)
      : content.groupCompleted(tools.length)
    : content.groupRunning(tools.length, toolLabel(runningTool.name));

  return (
    <div className="my-1 w-full min-w-0" role="group" aria-label={content.title}>
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <ToolStatusIcon status={runningTool === undefined ? failedCount > 0 ? "failed" : "completed" : runningTool.status} />
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
      {expanded ? (
        <div className="ml-2 flex flex-col gap-0.5">
          {tools.map((tool) => (
            <ToolCallRow
              key={tool.id}
              confirmation={confirmationFor(tool, confirmations)}
              tool={tool}
            />
          ))}
        </div>
      ) : null}
      {!expanded
        ? tools
            .filter((tool) => tool.status === "failed")
            .map((tool) => (
              <p key={tool.id} className="m-0 px-8 py-0.5 text-xs text-destructive [overflow-wrap:anywhere]">
                {toolLabel(tool.name)} · {tool.error_summary}
              </p>
            ))
        : null}
    </div>
  );
}

function ToolCallRow({
  confirmation,
  tool
}: {
  readonly confirmation: Confirmation | undefined;
  readonly tool: ToolCall;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Object.keys(tool.arguments).length > 0 ||
    tool.result !== null ||
    tool.error_summary !== null ||
    confirmation !== undefined;
  const duration = Math.max(
    0,
    Date.parse(tool.updated_at) - Date.parse(tool.created_at)
  );

  return (
    <div className="w-full min-w-0 py-0.5">
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] transition-colors hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
        disabled={!hasDetails}
        aria-expanded={hasDetails ? expanded : undefined}
        onClick={() => setExpanded((value) => !value)}
      >
        <ToolStatusIcon status={tool.status} />
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {toolLabel(tool.name)}
        </span>
        <code className="hidden max-w-[45%] truncate font-mono text-xs text-muted-foreground sm:block">
          {tool.name}
        </code>
        {hasDetails ? expanded
          ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          : null}
      </button>
      {tool.status === "failed" && !expanded ? (
        <p className="m-0 px-8 pb-1 text-xs text-destructive [overflow-wrap:anywhere]">
          {tool.error_summary}
        </p>
      ) : null}
      {expanded ? (
        <div className="ml-5 border-l-2 border-border py-1 pl-3">
          {Object.keys(tool.arguments).length > 0 ? (
            <ToolDetail label={content.input}>
              {formatDetail(tool.arguments)}
            </ToolDetail>
          ) : null}
          {tool.result !== null ? (
            <ToolDetail label={content.output}>
              {formatDetail(tool.result)}
            </ToolDetail>
          ) : null}
          {tool.error_summary !== null ? (
            <ToolDetail label={content.error} danger>
              {tool.error_summary}
            </ToolDetail>
          ) : null}
          {confirmation !== undefined ? (
            <ToolDetail label={content.confirmation}>
              {content.confirmationStatus[confirmation.status]}
            </ToolDetail>
          ) : null}
          <ToolDetail label={content.duration}>{formatDuration(duration)}</ToolDetail>
        </div>
      ) : null}
    </div>
  );
}

function confirmationFor(
  tool: ToolCall,
  confirmations: readonly Confirmation[]
): Confirmation | undefined {
  return confirmations.find((item) => item.tool_call_id === tool.id);
}

function formatDuration(milliseconds: number): string {
  return milliseconds < 1_000
    ? `${milliseconds} ms`
    : `${(milliseconds / 1_000).toFixed(2)} s`;
}

function ToolDetail({
  children,
  danger = false,
  label
}: {
  readonly children: ReactNode;
  readonly danger?: boolean;
  readonly label: string;
}) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-[11px] text-muted-foreground">{label}</div>
      <pre className={`m-0 max-h-72 overflow-auto rounded-md bg-muted px-2.5 py-2 font-mono text-xs leading-5 whitespace-pre-wrap [overflow-wrap:anywhere] ${danger ? "text-destructive" : "text-muted-foreground"}`}>
        {children}
      </pre>
    </div>
  );
}

function ToolStatusIcon({ status }: { readonly status: ToolCall["status"] }) {
  if (status === "pending" || status === "running") {
    return <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label={content.status[status]} />;
  }
  if (status === "completed") {
    return <Check className="size-3.5 shrink-0 text-success" aria-label={content.status.completed} />;
  }
  if (status === "failed") {
    return <X className="size-3.5 shrink-0 text-destructive" aria-label={content.status.failed} />;
  }
  return <Circle className="size-3.5 shrink-0 text-muted-foreground" aria-label={content.status.cancelled} />;
}

export function toolLabel(name: string): string {
  return content.names[name as keyof typeof content.names] ?? name;
}

function formatDetail(value: unknown): ReactNode {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
