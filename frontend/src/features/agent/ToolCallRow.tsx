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
import { ToolKindIcon, ToolStatusBadge, ToolTarget, ToolDetail, ToolParameters } from "./ToolActivityParts";
import { toolDuration, toolLabel, toolStatus, toolTarget } from "./tool-presentation";
import styles from "./ToolActivity.module.css";
import { SubagentCard } from "@/features/subagents/SubagentCard";

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
  const hasDetails =
    Object.keys(tool.arguments).length > 0 ||
    resultContent.length > 0 ||
    tool.error_summary !== null ||
    confirmation !== undefined;
  const duration = toolDuration(tool.id, records);
  const status = toolStatus(tool, runState, confirmation, records);
  const denied = status === "denied";
  const waitingQuestion = status === "waiting_input";
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
      {!denied && tool.status === "failed" && !expanded ? (
        <p className={styles.callError}>
          {tool.error_summary}
        </p>
      ) : null}
      {tool.name === "subagent" && <SubagentCard toolCallId={tool.id} />}
      {denied && <p className={styles.callDenied} data-tool-denied={tool.id}>{content.denied}</p>}
      {expanded ? (
        <div className={styles.detailPanel}>
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
            <ImageReadResult value={tool.result} text={toolContentText(resultContent)} images={images} sessionId={tool.session_id} offloadedIds={imageOffloads.get(tool.id)} />
          ) : tool.name === "glob" || tool.name === "grep" ? (
            <SearchResult value={tool.result} text={toolContentText(resultContent)} />
          ) : tool.name === "write" || tool.name === "edit" ? (
            <FileMutationResult value={tool.result} text={toolContentText(resultContent)} />
          ) : (
            <ToolDetail label={tool.name === "skill" ? zhCN.skills.instructions : content.output}>
              {formatToolResult(tool)}
            </ToolDetail>
          ) : null}
          {tool.name !== "read_image" && images.length > 0 && <AttachmentStrip sessionId={tool.session_id} attachments={images} offloadedIds={imageOffloads.get(tool.id)} />}
          {!denied && tool.error_summary !== null ? (
            <ToolDetail label={content.error} danger>
              {tool.error_summary}
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
