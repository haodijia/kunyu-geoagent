import {
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  MessageCircle,
  Image,
  FileText,
  ListTodo,
  LoaderCircle,
  PenLine,
  Search,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { ToolCall } from "@/features/agent/api";
import type { Confirmation } from "@/features/confirmations/api";
import { zhCN } from "@/locales/zh-CN";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { CopyButton } from "@/features/messages/CopyButton";
import type { TrajectoryEventProjection } from "@/features/events/projection";
import type { GeneratingTool } from "@/features/events/stream-presentation";

import { TodoItems } from "./TodoItems";
import { ImageReadResult } from "./ImageReadResult";
import { ReadResult } from "./ReadResult";
import { SearchResult } from "./SearchResult";
import { FileMutationResult } from "./FileMutationResult";
import { parseTodos } from "./todos";
import { parseToolContent, toolContentImages, toolContentText } from "./tool-content";
import { AttachmentStrip } from "@/features/attachments/AttachmentStrip";
import { collectImageOffloads } from "@/features/attachments/image-offloads";

const content = zhCN.conversation.tools;

export function GeneratingToolActivity({
  tools,
}: {
  readonly tools: readonly GeneratingTool[];
}) {
  return (
    <div
      className="my-1 w-full min-w-0"
      role="group"
      aria-label={content.generating}
    >
      {tools.map((tool) => (
        <GeneratingToolRow key={tool.index} tool={tool} />
      ))}
    </div>
  );
}
function GeneratingToolRow({ tool }: { readonly tool: GeneratingTool }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="w-full min-w-0 py-0.5">
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <LoaderCircle
          className="size-3.5 shrink-0 animate-spin text-muted-foreground"
          aria-label={content.generating}
        />
        {tool.name !== null && <ToolKindIcon name={tool.name} />}
        <span className="min-w-0 max-w-[35%] shrink truncate font-medium text-foreground">
          {tool.name === null ? content.title : toolLabel(tool.name)}
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-secondary-foreground">
          {tool.arguments}
        </code>
        {expanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="mt-0.5 mb-1.5 ml-4 border-l-2 border-border pt-1.5 pb-0.5 pl-3">
          <ToolDetail label={content.generating}>{tool.arguments}</ToolDetail>
        </div>
      )}
    </div>
  );
}

export function ToolActivity({
  confirmations,
  tools,
}: {
  readonly confirmations: readonly Confirmation[];
  readonly tools: readonly ToolCall[];
}) {
  const [expanded, setExpanded] = useState(false);
  const { records } = useSessionEvents();
  const waitingQuestion = tools.some((tool) => isWaitingQuestion(tool, records));
  if (tools.length === 0) return null;
  if (tools.length === 1) {
    return (
      <ToolCallRow
        confirmation={confirmationFor(tools[0]!, confirmations)}
        tool={tools[0]!}
      />
    );
  }

  const runningTool = tools.find((tool) => tool.status === "running");
  const pendingTool = tools.find((tool) => tool.status === "pending");
  const cancelledCount = tools.filter(
    (tool) => tool.status === "cancelled",
  ).length;
  const failedCount = tools.filter((tool) => tool.status === "failed").length;
  const summary = waitingQuestion ? zhCN.questions.waiting :
    runningTool === undefined
      ? failedCount > 0
        ? content.groupFailed(tools.length, failedCount)
        : pendingTool !== undefined
          ? content.groupPending(tools.length)
          : cancelledCount > 0
            ? content.groupCancelled(tools.length, cancelledCount)
            : content.groupCompleted(tools.length)
      : content.groupRunning(tools.length, toolLabel(runningTool.name));

  return (
    <div
      className="my-1 w-full min-w-0"
      role="group"
      aria-label={content.title}
    >
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] text-secondary-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {waitingQuestion ? <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-label={zhCN.questions.waiting} /> : <ToolStatusIcon
          status={
            runningTool === undefined
              ? failedCount > 0
                ? "failed"
                : pendingTool !== undefined
                  ? "pending"
                  : cancelledCount > 0
                    ? "cancelled"
                    : "completed"
              : runningTool.status
          }
        />}
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        {expanded ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
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
              <p
                key={tool.id}
                className="m-0 px-8 py-0.5 text-xs text-destructive [overflow-wrap:anywhere]"
              >
                {toolLabel(tool.name)} · {tool.error_summary}
              </p>
            ))
        : null}
    </div>
  );
}

function ToolCallRow({
  confirmation,
  tool,
}: {
  readonly confirmation: Confirmation | undefined;
  readonly tool: ToolCall;
}) {
  const [expanded, setExpanded] = useState(false);
  const { records } = useSessionEvents();
  const imageOffloads = useMemo(() => collectImageOffloads(records), [records]);
  const resultContent = useMemo(() => tool.status === "completed" ? parseToolContent(tool.content) : [], [tool.status, tool.content]);
  const images = useMemo(() => toolContentImages(resultContent), [resultContent]);
  const started = records
    .filter(
      (record) =>
        record.entityId === tool.id && record.eventType === "tool.started",
    )
    .at(-1);
  const hasDetails =
    Object.keys(tool.arguments).length > 0 ||
    resultContent.length > 0 ||
    tool.error_summary !== null ||
    confirmation !== undefined;
  const duration =
    started === undefined ||
    tool.status === "pending" ||
    tool.status === "running"
      ? null
      : Math.max(
          0,
          Date.parse(tool.updated_at) - Date.parse(started.occurredAt),
        );
  const waitingQuestion = isWaitingQuestion(tool, records);
  const preview = waitingQuestion ? zhCN.questions.waiting : images.length > 0 ? images.map((ref) => ref.name).join(", ") : toolPreview(tool.arguments);

  return (
    <div className="w-full min-w-0 py-0.5">
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:hover:bg-transparent"
        disabled={!hasDetails}
        aria-expanded={hasDetails ? expanded : undefined}
        onClick={() => setExpanded((value) => !value)}
      >
        {waitingQuestion ? <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-label={zhCN.questions.waiting} /> : <ToolStatusIcon status={tool.status} />}
        <ToolKindIcon name={tool.name} />
        <span
          className="min-w-0 max-w-[35%] shrink truncate font-medium text-foreground"
          title={toolLabel(tool.name)}
        >
          {toolLabel(tool.name)}
        </span>
        <code
          className="min-w-0 flex-1 truncate font-mono text-xs text-secondary-foreground"
          title={preview}
        >
          {preview}
        </code>
        {hasDetails ? (
          expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )
        ) : null}
      </button>
      {tool.status === "failed" && !expanded ? (
        <p className="m-0 px-8 pb-1 text-xs text-destructive [overflow-wrap:anywhere]">
          {tool.error_summary}
        </p>
      ) : null}
      {expanded ? (
        <div className="mt-0.5 mb-1.5 ml-4 border-l-2 border-border pt-1.5 pb-0.5 pl-3">
          {Object.keys(tool.arguments).length > 0 ? (
            <ToolDetail label={content.input}>
              {formatDetail(tool.arguments)}
            </ToolDetail>
          ) : null}
          {tool.status === "completed" ? tool.name === "todo_write" ? (
            <div className="mb-2">
              <div className="mb-1 flex items-center justify-between text-[11px] text-secondary-foreground">
                <span>{content.output}</span>
                <CopyButton text={formatToolResult(tool)} />
              </div>
              <TodoItems items={todoResultItems(tool.result)} />
            </div>
          ) : tool.name === "read" ? (
            <ReadResult value={tool.result} text={toolContentText(resultContent)} />
          ) : tool.name === "read_image" ? (
            <ImageReadResult value={tool.result} text={toolContentText(resultContent)} />
          ) : tool.name === "glob" || tool.name === "grep" ? (
            <SearchResult value={tool.result} text={toolContentText(resultContent)} />
          ) : tool.name === "write" || tool.name === "edit" ? (
            <FileMutationResult toolId={tool.id} value={tool.result} text={toolContentText(resultContent)} />
          ) : (
            <ToolDetail label={tool.name === "skill" ? zhCN.skills.instructions : content.output}>
              {formatToolResult(tool)}
            </ToolDetail>
          ) : null}
          {images.length > 0 && <AttachmentStrip sessionId={tool.session_id} attachments={images} offloadedIds={imageOffloads.get(tool.id)} />}
          {tool.error_summary !== null ? (
            <ToolDetail label={content.error} danger>
              {tool.error_summary}
            </ToolDetail>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 py-1 text-[11px] text-secondary-foreground">
            {confirmation !== undefined ? (
              <span>
                {content.confirmation} ·{" "}
                {content.confirmationStatus[confirmation.status]}
              </span>
            ) : null}
            {duration !== null && (
              <span>
                {content.duration} · {formatDuration(duration)}
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function confirmationFor(
  tool: ToolCall,
  confirmations: readonly Confirmation[],
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
  label,
}: {
  readonly children: string;
  readonly danger?: boolean;
  readonly label: string;
}) {
  const [full, setFull] = useState(false);
  const head = children.split("\n").slice(0, 14).join("\n").slice(0, 1_400);
  const clipped = head.length < children.length;
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 flex items-center justify-between text-[11px] text-secondary-foreground">
        <span>{label}</span>
        <CopyButton text={children} />
      </div>
      <pre
        className={`m-0 max-h-80 overflow-auto rounded-md bg-muted px-2.5 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${danger ? "text-destructive" : "text-secondary-foreground"}`}
      >
        {full || !clipped ? children : `${head}\n…`}
      </pre>
      {clipped ? (
        <button
          type="button"
          className="mt-0.5 rounded px-1.5 py-0.5 text-xs text-secondary-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-expanded={full}
          onClick={() => setFull((value) => !value)}
        >
          {full ? content.showLess : content.showMore}
        </button>
      ) : null}
    </div>
  );
}

function ToolStatusIcon({ status }: { readonly status: ToolCall["status"] }) {
  if (status === "running") {
    return (
      <LoaderCircle
        className="size-3.5 shrink-0 animate-spin text-muted-foreground"
        aria-label={content.status[status]}
      />
    );
  }
  if (status === "completed") {
    return (
      <Circle
        fill="currentColor"
        className="size-1.5 shrink-0 rounded-full bg-success text-success"
        aria-label={content.status.completed}
      />
    );
  }
  if (status === "failed") {
    return (
      <X
        className="size-3.5 shrink-0 text-destructive"
        aria-label={content.status.failed}
      />
    );
  }
  return (
    <Circle
      className="size-3.5 shrink-0 text-muted-foreground"
      aria-label={content.status[status]}
    />
  );
}

export function toolLabel(name: string): string {
  return content.names[name as keyof typeof content.names] ?? name;
}

function ToolKindIcon({ name }: { readonly name: string }) {
  const Icon =
    name === "ask_user_question" ? MessageCircle : name === "write" || name === "edit" ? PenLine : name === "read" ? FileText : name === "read_image" ? Image : name === "todo_write" ? ListTodo : name === "memory_read" || name === "glob" || name === "grep"
      ? Search
      : name === "memory_write"
        ? PenLine
        : name === "skill" || name === "skill_resource"
          ? Sparkles
          : Wrench;
  return (
    <Icon
      className="size-3 shrink-0 text-secondary-foreground opacity-70"
      strokeWidth={1.5}
      aria-hidden="true"
    />
  );
}

function toolPreview(arguments_: ToolCall["arguments"]): string | undefined {
  if (Array.isArray(arguments_.questions)) {
    return arguments_.questions.map((item) => typeof item === "object" && item !== null && "question" in item ? String(item.question) : "").join(" · ");
  }
  for (const key of [
    "name",
    "command",
    "file_path",
    "path",
    "query",
    "pattern",
    "url",
    "prompt",
    "content",
  ]) {
    const value = arguments_[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function formatDetail(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function formatToolResult(tool: ToolCall): string {
  const result = tool.result;
  if (
    (tool.name === "skill" || tool.name === "skill_resource") &&
    result !== null &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    "content" in result &&
    typeof result.content === "string"
  ) {
    return result.content;
  }
  return toolContentText(parseToolContent(tool.content));
}

function todoResultItems(result: ToolCall["result"]) {
  if (typeof result !== "object" || result === null || Array.isArray(result) || !("todos" in result))
    throw new Error("Todo tool result has no task list.");
  return parseTodos(result.todos);
}


function isWaitingQuestion(tool: ToolCall, records: readonly TrajectoryEventProjection[]): boolean {
  return tool.status === "running" && records.some((request) =>
    request.eventType === "question.requested" && request.payload.tool_call_id === tool.id &&
    !records.some((decision) => decision.eventType === "question.resolved" && decision.entityId === request.entityId)
  );
}
