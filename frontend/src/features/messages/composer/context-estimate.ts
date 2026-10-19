// Adapted from deepseek-harness (MIT); mirrors agent/context/token_estimate.py.
// These structural estimates are separate from provider-reported token counts.

import type { AssistantStreamRecord } from "@/features/events/stream/assistant-stream";
import { streamPresentation } from "@/features/events/stream/stream-presentation";

const textTokens = (text: string) => Math.ceil(text.length / 4);

export function contextRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid context usage record.");
  return value as Readonly<Record<string, unknown>>;
}

export function contextArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid context usage list.");
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid context usage text.");
  return value;
}

function estimateBlock(value: unknown): number {
  const block = contextRecord(value);
  if (block.type === "text" || block.type === "reasoning")
    return textTokens(text(block.text)) + 4;
  if (block.type === "tool-call")
    return textTokens(text(block.name)) + textTokens(text(block.arguments)) + 4;
  const { offloaded: _offloaded, ...structure } = block;
  return textTokens(JSON.stringify(structure)) + 4;
}

export function estimateMessage(value: unknown): number {
  const message = contextRecord(value);
  const blocks = contextArray(message.content);
  if (message.role === "system") {
    if (blocks.length === 0) return 0;
    return textTokens(blocks.map((value) => {
      const block = contextRecord(value);
      return block.type === "text" ? text(block.text) : JSON.stringify(block);
    }).join("")) + 4;
  }
  return blocks.reduce<number>((sum, block) => sum + estimateBlock(block), 4);
}

export function estimateEnvelope(messages: unknown, tools: unknown): number {
  return contextArray(messages).reduce<number>((sum, message) => sum + estimateMessage(message), 0)
    + contextArray(tools).reduce<number>((sum, value) => {
      const tool = contextRecord(value);
      return sum + textTokens(JSON.stringify({ name: tool.name, description: tool.description, parameters: tool.parameters }));
    }, 0);
}

export function estimateStream(stream: readonly AssistantStreamRecord[]): number {
  const { blocks } = streamPresentation(stream);
  if (blocks.length === 0) return 0;
  return 4 + blocks.reduce((sum, block) => sum + (
    block.type === "tool-call"
      ? textTokens(block.name ?? "") + textTokens(block.arguments) + 4
      : textTokens(block.text) + 4
  ), 0);
}
