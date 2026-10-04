import type { ToolCall } from "@/features/agent/api";
import type { Confirmation } from "@/features/confirmations/api";
import { conversationSlots } from "@/features/conversation/slots";
import type { PresentedBlock } from "@/features/events/stream-presentation";
import { MessageMarkdown } from "./MessageMarkdown";
import { MessageReasoning } from "./MessageReasoning";

type ToolBlock = Extract<PresentedBlock, { type: "tool-call" }>;
type ContentGroup =
  | Exclude<PresentedBlock, ToolBlock>
  | { type: "tools"; index: number; blocks: ToolBlock[] };

/** Preserve block order while keeping adjacent calls in Mu's existing tool group. */
export function AssistantContent({
  blocks,
  messageId,
  active,
  generating,
  updatedAt,
  tools,
  confirmations,
}: {
  readonly blocks: readonly PresentedBlock[];
  readonly messageId: string;
  readonly active: boolean;
  readonly generating: boolean;
  readonly updatedAt: string;
  readonly tools: readonly ToolCall[];
  readonly confirmations: readonly Confirmation[];
}) {
  const groups: ContentGroup[] = [];
  for (const block of blocks) {
    const previous = groups.at(-1);
    if (block.type !== "tool-call") groups.push(block);
    else if (previous?.type === "tools") previous.blocks.push(block);
    else groups.push({ type: "tools", index: block.index, blocks: [block] });
  }
  return groups.map((group) => {
    if (group.type === "reasoning")
      return group.startedAt === null ? null : (
        <MessageReasoning
          key={`reasoning:${group.index}`}
          id={`${messageId}:${group.index}`}
          reasoning={{
            text: group.text,
            startedAt: group.startedAt,
            finishedAt: group.finishedAt,
          }}
          active={active && group.finishedAt === null}
          updatedAt={updatedAt}
        />
      );
    if (group.type === "text")
      return group.text === "" ? null : (
        <MessageMarkdown key={`text:${group.index}`} text={group.text} />
      );
    const identities = new Set(group.blocks.map((block) => block.id));
    const committed = tools.filter((tool) =>
      identities.has(tool.provider_call_id),
    );
    const pending = group.blocks.filter(
      (block) => !committed.some((tool) => tool.provider_call_id === block.id),
    );
    return (
      <div key={`tools:${group.index}`} className="w-full">
        {committed.length > 0 &&
          conversationSlots.render("message.tools", {
            confirmations,
            tools: committed,
          })}
        {generating &&
          pending.length > 0 &&
          conversationSlots.render("message.generating-tools", {
            tools: pending,
          })}
      </div>
    );
  });
}
