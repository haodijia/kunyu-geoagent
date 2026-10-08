import { Down, Right } from "@icon-park/react";
import { useMemo, useState } from "react";
import type { AgentTurnState, ToolCall } from "./api";
import type { Confirmation } from "@/features/confirmations/api";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { CopyButton } from "@/features/messages/CopyButton";
import { zhCN } from "@/locales/zh-CN";
import { TodoItems } from "./TodoItems";
import { ImageReadResult } from "./ImageReadResult";
import { ReadResult } from "./ReadResult";
import { SearchResult } from "./SearchResult";
import { FileMutationResult } from "./FileMutationResult";
import { parseTodos } from "./todos";
import { parseToolContent, toolContentImages, toolContentText } from "./tool-content";
import { AttachmentStrip } from "@/features/attachments/AttachmentStrip";
import { collectImageOffloads } from "@/features/attachments/image-offloads";
import { ToolKindIcon, ToolStatusBadge, ToolTarget, ToolDetail } from "./ToolActivityParts";
import { isWaitingQuestion, toolLabel, toolStatus, toolTarget } from "./tool-presentation";
import styles from "./ToolActivity.module.css";

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
  const status = toolStatus(tool, runState, confirmation);
  const denied = status === "denied";
  const waitingQuestion = status === "running" && isWaitingQuestion(tool, records);
  const target = waitingQuestion ? { text: zhCN.questions.waiting, path: false } : images.length > 0 ? { text: images.map((ref) => ref.name).join(", "), path: false } : toolTarget(tool.arguments);

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
        <ToolStatusBadge status={waitingQuestion ? "waiting" : status} label={waitingQuestion ? zhCN.questions.waiting : content.status[status]} />
        <ToolKindIcon name={tool.name} />
        <span
          className={styles.callName}
          title={toolLabel(tool.name)}
        >
          {toolLabel(tool.name)}
        </span>
        <ToolTarget target={target} />
        {hasDetails ? (
          expanded ? (
            <Down size={12} aria-hidden="true" />
          ) : (
            <Right size={12} aria-hidden="true" />
          )
        ) : null}
      </button>
      {!denied && tool.status === "failed" && !expanded ? (
        <p className={styles.callError}>
          {tool.error_summary}
        </p>
      ) : null}
      {denied && <p className={styles.callDenied} data-tool-denied={tool.id}>{content.denied}</p>}
      {expanded ? (
        <div className={styles.detailPanel}>
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
            <FileMutationResult value={tool.result} text={toolContentText(resultContent)} />
          ) : (
            <ToolDetail label={tool.name === "skill" ? zhCN.skills.instructions : content.output}>
              {formatToolResult(tool)}
            </ToolDetail>
          ) : null}
          {images.length > 0 && <AttachmentStrip sessionId={tool.session_id} attachments={images} offloadedIds={imageOffloads.get(tool.id)} />}
          {!denied && tool.error_summary !== null ? (
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

function formatDuration(milliseconds: number): string {
  return milliseconds < 1_000
    ? `${milliseconds} ms`
    : `${(milliseconds / 1_000).toFixed(2)} s`;
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
