import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";
import type { AgentTurn } from "@/features/agent/api";
import { toolLabel, toolTarget } from "@/features/agent/tool-presentation";
import type { TrajectoryEventProjection } from "@/features/events/projection";
import type { ActiveAssistant } from "@/features/events/live-assistant";
import { streamPresentation } from "@/features/events/stream-presentation";
import { collectMessageBlocks } from "@/features/messages/message-blocks";
import { thoughtTail } from "@/features/messages/reasoning";
import type { SessionMessage } from "@/features/messages/api";
import { zhCN } from "@/locales/zh-CN";

const parser = unified().use(remarkParse).use(remarkGfm);
export interface FlowMessage {
  readonly id: string;
  readonly text: string;
  readonly role: "user" | "assistant";
  readonly kind: "text" | "reasoning" | "tool-call";
}

export function mapConversationRows(
  messages: readonly SessionMessage[],
  turns: readonly AgentTurn[],
  records: readonly TrajectoryEventProjection[],
  active: ActiveAssistant | null,
): FlowMessage[] {
  const settled = collectMessageBlocks(records);
  const live = active === null ? null : streamPresentation(active.stream);
  const tools = turns.flatMap((turn) => turn.tool_calls);
  const rows: FlowMessage[] = [];
  function append(messageId: string, blocks: ReturnType<typeof streamPresentation>["blocks"]) {
    for (const block of blocks) {
      const id = `${messageId}:${block.index}`;
      if (block.type === "tool-call") {
        const tool = tools.find((call) => call.message_id === messageId && call.provider_call_id === block.id);
        const target = tool === undefined ? undefined : toolTarget(tool.arguments);
        const name = tool?.name ?? block.name;
        rows.push({ id, role: "assistant", kind: block.type, text: [
          name === null ? zhCN.conversation.tools.generating : toolLabel(name),
          target?.text,
          tool === undefined ? zhCN.conversation.tools.generating : zhCN.conversation.tools.status[tool.status],
        ].filter((part) => part !== undefined).join(" · ") });
      } else if (block.text.trim() !== "") {
        const text = toString(parser.parse(block.text)).replace(/\s+/g, " ").trim();
        rows.push({ id, role: "assistant", kind: block.type, text: block.type === "reasoning"
          ? `${zhCN.mapConversation.thinking} · ${thoughtTail(text)}` : text });
      }
    }
  }
  for (const message of messages.slice(-8)) {
    if (message.role === "user") {
      if (message.content.trim() !== "") rows.push({ id: message.id, role: "user", kind: "text", text: toString(parser.parse(message.content)).replace(/\s+/g, " ").trim() });
    } else if (message.id === active?.attempt_id && live !== null) {
      append(message.id, live.blocks);
    } else {
      const blocks = settled.get(message.id);
      if (blocks !== undefined) append(message.id, [...blocks]);
      else if (message.content.trim() !== "") rows.push({ id: message.id, role: "assistant", kind: "text", text: toString(parser.parse(message.content)).replace(/\s+/g, " ").trim() });
    }
  }
  if (active !== null && live !== null && !messages.some((message) => message.id === active.attempt_id)) append(active.attempt_id, live.blocks);
  return rows.slice(-2);
}
