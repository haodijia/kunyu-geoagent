import type { AgentTurnState, ToolCall } from "@/features/agent/api";
import type { Confirmation } from "@/features/confirmations/api";
import { conversationSlots } from "@/features/conversation/slots";
import type { PresentedBlock } from "@/features/events/stream/stream-presentation";
import { MessageMarkdown } from "@/features/messages/rendering/MessageMarkdown";
import { MessageReasoning } from "@/features/messages/rendering/MessageReasoning";
import { computed, defineComponent } from "vue";
type ToolBlock = Extract<
  PresentedBlock,
  {
    type: "tool-call";
  }
>;
type ContentGroup =
  | Exclude<PresentedBlock, ToolBlock>
  | {
      type: "tools";
      index: number;
      blocks: ToolBlock[];
    };

/** Preserve block order while rendering adjacent tool calls together. */
export const AssistantContent = defineComponent(
  (
    componentProps: {
      readonly blocks: readonly PresentedBlock[];
      readonly messageId: string;
      readonly active: boolean;
      readonly generating: boolean;
      readonly updatedAt: string;
      readonly tools: readonly ToolCall[];
      readonly runState: AgentTurnState | null;
      readonly confirmations: readonly Confirmation[];
    },
    { slots: _slots },
  ) => {
    const blocks = computed(() => componentProps.blocks),
      messageId = computed(() => componentProps.messageId),
      active = computed(() => componentProps.active),
      generating = computed(() => componentProps.generating),
      updatedAt = computed(() => componentProps.updatedAt),
      tools = computed(() => componentProps.tools),
      confirmations = computed(() => componentProps.confirmations),
      runState = computed(() => componentProps.runState);
    const groups = computed(() => {
      const result: ContentGroup[] = [];
      for (const block of blocks.value) {
        const previous = result.at(-1);
        if (block.type !== "tool-call") result.push(block);
        else if (previous?.type === "tools") previous.blocks.push(block);
        else
          result.push({
            type: "tools",
            index: block.index,
            blocks: [block],
          });
      }
      return result;
    });
    return () => {
      const _messageId = messageId.value,
        _active = active.value,
        _updatedAt = updatedAt.value,
        _tools = tools.value,
        _confirmations = confirmations.value,
        _runState = runState.value,
        _generating = generating.value;
      return groups.value.map((group) => {
        if (group.type === "reasoning")
          return group.startedAt === null ? null : (
            <MessageReasoning
              key={`reasoning:${group.index}`}
              id={`${_messageId}:${group.index}`}
              reasoning={{
                text: group.text,
                startedAt: group.startedAt,
                finishedAt: group.finishedAt,
              }}
              active={_active && group.finishedAt === null}
              updatedAt={_updatedAt}
            />
          );
        if (group.type === "text")
          return group.text === "" ? null : (
            <div
              key={`text:${group.index}`}
              class="w-full"
              data-reply-content={_messageId}
            >
              <MessageMarkdown text={group.text} />
            </div>
          );
        const identities = new Set(group.blocks.map((block) => block.id));
        const committed = _tools.filter((tool) =>
          identities.has(tool.provider_call_id),
        );
        const pending = _generating
          ? group.blocks.filter(
              (block) =>
                !committed.some((tool) => tool.provider_call_id === block.id),
            )
          : [];
        if (committed.length === 0 && pending.length === 0) return null;
        return (
          <div key={`tools:${group.index}`} class="w-full">
            {conversationSlots.render("message.tools", {
              confirmations: _confirmations,
              runState: _runState,
              tools: committed,
              generatingTools: pending,
            })}
          </div>
        );
      });
    };
  },
  {
    name: "AssistantContent",
    inheritAttrs: false,
    props: [
      "blocks",
      "messageId",
      "active",
      "generating",
      "updatedAt",
      "tools",
      "confirmations",
      "runState",
    ],
  },
);
