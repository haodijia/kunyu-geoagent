import type { AgentTurn, ToolCall } from "@/features/agent/api";
import {
  toolLabel,
  toolTarget,
} from "@/features/agent/tools/tool-presentation";
import type { TrajectoryEventProjection } from "@/features/events/projection/events";
import type { ActiveAssistant } from "@/features/events/stream/live-assistant";
import {
  streamPresentation,
  type PresentedBlock,
} from "@/features/events/stream/stream-presentation";
import type { SessionMessage } from "@/features/messages/api";
import { collectMessageBlocks } from "@/features/messages/model/message-blocks";
import { zhCN } from "@/locales/zh-CN";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
const parser = unified().use(remarkParse).use(remarkGfm);
const PREVIEW_TEXT_LIMIT = 2_048;
export interface FlowMessage {
  readonly id: string;
  readonly text: string;
  readonly role: "user" | "assistant";
  readonly kind: "text" | "reasoning" | "tool-call";
}
function markdownText(text: string): string {
  const tail = text.slice(-PREVIEW_TEXT_LIMIT);
  const paragraph = tail.indexOf("\n\n");
  const preview =
    text.length > PREVIEW_TEXT_LIMIT &&
    paragraph >= 0 &&
    paragraph < tail.length / 2
      ? tail.slice(paragraph + 2)
      : tail;
  return parser
    .parse(preview)
    .children.map((block) => {
      if (block.type === "table")
        return block.children
          .map((row) => row.children.map((cell) => toString(cell)).join(" | "))
          .join("\n");
      if (block.type === "list")
        return block.children.map((item) => toString(item)).join("\n");
      return toString(block);
    })
    .join("\n")
    .trim();
}
export function prepareMapConversation(
  messages: readonly SessionMessage[],
  turns: readonly AgentTurn[],
  records: readonly TrajectoryEventProjection[],
): (active: ActiveAssistant | null) => FlowMessage[] {
  const settled = collectMessageBlocks(records);
  const recent = messages.slice(-8);
  const locations = new Map<string, Map<string, ToolCall>>();
  for (const turn of turns) {
    for (const tool of turn.tool_calls) {
      let tools = locations.get(tool.message_id);
      if (tools === undefined)
        locations.set(tool.message_id, (tools = new Map()));
      tools.set(tool.provider_call_id, tool);
    }
  }
  const savedRows = new Map<string, readonly FlowMessage[]>();
  function blockRows(
    messageId: string,
    blocks: readonly PresentedBlock[],
  ): FlowMessage[] {
    const rows: FlowMessage[] = [];
    const tools = locations.get(messageId);
    for (
      let index = blocks.length - 1;
      index >= 0 && rows.length < 2;
      index--
    ) {
      const block = blocks[index]!;
      const id = `${messageId}:${block.index}`;
      if (block.type === "tool-call") {
        const tool = tools?.get(block.id);
        const target =
          tool === undefined ? undefined : toolTarget(tool.arguments);
        const name = tool?.name ?? block.name;
        rows.unshift({
          id,
          role: "assistant",
          kind: block.type,
          text: [
            name === null
              ? zhCN.conversation.tools.generating
              : toolLabel(name),
            target?.text,
            tool === undefined
              ? zhCN.conversation.tools.generating
              : zhCN.conversation.tools.status[tool.status],
          ]
            .filter((part) => part !== undefined)
            .join(" · "),
        });
      } else if (block.text.trim() !== "") {
        const text = markdownText(block.text);
        rows.unshift({
          id,
          role: "assistant",
          kind: block.type,
          text:
            block.type === "reasoning"
              ? `${zhCN.mapConversation.thinking} · ${text}`
              : text,
        });
      }
    }
    return rows;
  }
  function settledRows(message: SessionMessage): readonly FlowMessage[] {
    const cached = savedRows.get(message.id);
    if (cached !== undefined) return cached;
    const blocks =
      message.role === "assistant" ? settled.get(message.id) : undefined;
    const rows: FlowMessage[] =
      blocks !== undefined
        ? blockRows(message.id, blocks)
        : message.content.trim() === ""
          ? []
          : [
              {
                id: message.id,
                role: message.role,
                kind: "text",
                text: markdownText(message.content),
              },
            ];
    savedRows.set(message.id, rows);
    return rows;
  }
  const messageIds = new Set(messages.map((message) => message.id));
  return (active) => {
    const rows: FlowMessage[] = [];
    const activeRows = () =>
      active === null
        ? []
        : blockRows(
            active.attempt_id,
            streamPresentation(active.stream).blocks,
          );
    if (active !== null && !messageIds.has(active.attempt_id))
      rows.push(...activeRows());
    for (
      let index = recent.length - 1;
      index >= 0 && rows.length < 2;
      index--
    ) {
      const message = recent[index]!;
      rows.unshift(
        ...(message.id === active?.attempt_id
          ? activeRows()
          : settledRows(message)),
      );
    }
    return rows.slice(-2);
  };
}
