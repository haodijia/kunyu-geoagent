import type { ReactNode } from "react";

import type { ToolCall } from "@/features/agent/api";
import {
  ToolActivity,
  GeneratingToolActivity,
} from "@/features/agent/ToolActivity";
import type { GeneratingTool } from "@/features/events/live-assistant";
import type { Confirmation } from "@/features/confirmations/api";

interface ConversationSlots {
  readonly "message.generating-tools": {
    readonly tools: readonly GeneratingTool[];
  };
  readonly "message.tools": {
    readonly confirmations: readonly Confirmation[];
    readonly tools: readonly ToolCall[];
  };
}

type SlotRenderer<Props> = (props: Props) => ReactNode;

class ConversationSlotRegistry {
  private readonly renderers = new Map<
    keyof ConversationSlots,
    SlotRenderer<never>
  >();

  register<Name extends keyof ConversationSlots>(
    name: Name,
    renderer: SlotRenderer<ConversationSlots[Name]>,
  ): void {
    if (this.renderers.has(name)) {
      throw new Error(`Conversation slot '${name}' is already registered.`);
    }
    this.renderers.set(name, renderer as SlotRenderer<never>);
  }

  render<Name extends keyof ConversationSlots>(
    name: Name,
    props: ConversationSlots[Name],
  ): ReactNode {
    const renderer = this.renderers.get(name);
    if (renderer === undefined) {
      throw new Error(`Conversation slot '${name}' is not registered.`);
    }
    return (renderer as SlotRenderer<ConversationSlots[Name]>)(props);
  }
}

export const conversationSlots = new ConversationSlotRegistry();
conversationSlots.register("message.generating-tools", ({ tools }) => (
  <GeneratingToolActivity tools={tools} />
));
conversationSlots.register("message.tools", ({ confirmations, tools }) => (
  <ToolActivity confirmations={confirmations} tools={tools} />
));
