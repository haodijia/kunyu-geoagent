// Copyright 2025 AionUi (aionui.com)
// SPDX-License-Identifier: Apache-2.0
// Adapted from Mu/AionUi toolActivity and ToolKindIcon (Apache-2.0).
// See licenses/AionUi-LICENSE.txt.
import type { AgentTurnState, ToolCall } from "./api";
import type { Confirmation } from "@/features/confirmations/api";
import type { TrajectoryEventProjection } from "@/features/events/projection";
import { zhCN } from "@/locales/zh-CN";

type ToolKind = "read" | "edit" | "shell" | "search" | "web" | "agent" | "other";
export type ToolDisplayStatus = ToolCall["status"] | "denied" | "interrupted" | "unknown" | "waiting";
export interface ToolTargetValue { readonly text: string; readonly path: boolean; }

const kinds: readonly (readonly [readonly string[], ToolKind])[] = [
  [["bash", "shell", "exec", "terminal", "command", "run"], "shell"],
  [["write", "edit", "replace", "patch", "apply", "notebook", "create"], "edit"],
  [["read", "cat", "view", "open", "file"], "read"],
  [["grep", "glob", "search", "find", "rg", "ls", "list"], "search"],
  [["web", "fetch", "browser", "url", "http", "curl", "navigate"], "web"],
  [["hive", "delegate", "agent", "task", "bee", "swarm"], "agent"],
];

export function toolKind(name: string): ToolKind {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/);
  for (const [terms, kind] of kinds) if (words.some((word) => terms.includes(word))) return kind;
  return "other";
}

export function toolLabel(name: string): string {
  const names = zhCN.conversation.tools.names;
  return Object.hasOwn(names, name) ? names[name as keyof typeof names] : name;
}

export function toolTarget(arguments_: ToolCall["arguments"]): ToolTargetValue | undefined {
  if (Array.isArray(arguments_.questions)) {
    const questions = arguments_.questions.filter((item): item is { question: string } =>
      typeof item === "object" && item !== null && "question" in item && typeof item.question === "string");
    if (questions.length > 0) return { text: questions.map((item) => item.question).join(" · "), path: false };
  }
  for (const key of ["command", "file_path", "path", "query", "pattern", "url", "prompt", "plan", "name", "content"]) {
    const value = arguments_[key];
    if (typeof value === "string" && value.length > 0) return { text: value, path: key === "file_path" || key === "path" };
  }
  return undefined;
}

export function toolStatus(tool: ToolCall, runState: AgentTurnState | null, confirmation: Confirmation | undefined): ToolDisplayStatus {
  if (confirmation?.status === "rejected") return "denied";
  if (tool.status === "completed" || tool.status === "failed" || tool.status === "cancelled") return tool.status;
  if (runState === "interrupted") return "interrupted";
  if (runState === "cancelled" || runState === "completed" || runState === "failed") return "cancelled";
  if (confirmation?.status === "pending") return "waiting";
  if (tool.status === "running" && runState !== "tool_running" && runState !== "waiting_input") return "unknown";
  return tool.status;
}

export function toolErrorLine(tool: ToolCall): string | null {
  if (tool.error_summary === null) return null;
  const line = tool.error_summary.split("\n").map((part) => part.trim()).find((part) => part.length > 0);
  if (line === undefined) return null;
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}

export function isWaitingQuestion(tool: ToolCall, records: readonly TrajectoryEventProjection[]): boolean {
  return tool.status === "running" && records.some((request) =>
    request.eventType === "question.requested" && request.payload.tool_call_id === tool.id &&
    !records.some((decision) => decision.eventType === "question.resolved" && decision.entityId === request.entityId));
}
