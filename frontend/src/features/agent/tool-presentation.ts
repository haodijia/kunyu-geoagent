// Copyright 2025 AionUi (aionui.com)
// SPDX-License-Identifier: Apache-2.0
// Adapted from Mu/AionUi toolActivity and ToolKindIcon (Apache-2.0).
import type { AgentTurnState, ToolCall } from "./api";
import type { Confirmation } from "@/features/confirmations/api";
import type { TrajectoryEventProjection } from "@/features/events/projection";
import { zhCN } from "@/locales/zh-CN";

type ToolKind = "read" | "edit" | "shell" | "search" | "web" | "agent" | "other";
export type ToolDisplayStatus = ToolCall["status"] | "denied" | "interrupted" | "unknown" | "waiting" | "waiting_input";
export interface ToolTargetValue { readonly text: string; readonly path: boolean; }

const kinds: readonly (readonly [readonly string[], ToolKind])[] = [
  [["bash", "shell", "exec", "terminal", "command", "run"], "shell"],
  [["write", "edit", "replace", "patch", "apply", "notebook", "create"], "edit"],
  [["read", "cat", "view", "open", "file"], "read"],
  [["grep", "glob", "search", "find", "rg", "ls", "list"], "search"],
  [["web", "fetch", "browser", "url", "http", "curl", "navigate"], "web"],
  [["hive", "delegate", "agent", "subagent", "subagents", "task", "bee", "swarm"], "agent"],
];

export function toolKind(name: string): ToolKind {
  if (name.startsWith("oge_")) return "web";
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/);
  for (const [terms, kind] of kinds) if (words.some((word) => terms.includes(word))) return kind;
  return "other";
}

export function toolLabel(name: string): string {
  const names = zhCN.conversation.tools.names;
  return Object.hasOwn(names, name) ? names[name as keyof typeof names] : name;
}

export function toolTarget(arguments_: ToolCall["arguments"]): ToolTargetValue | undefined {
  if (typeof arguments_.image_id === "number") return { text: String(arguments_.image_id), path: false };
  if (typeof arguments_.start_time === "string" && typeof arguments_.end_time === "string") {
    return { text: `${arguments_.start_time} → ${arguments_.end_time}`, path: false };
  }
  if (Array.isArray(arguments_.questions)) {
    const questions = arguments_.questions.filter((item): item is { question: string } =>
      typeof item === "object" && item !== null && "question" in item && typeof item.question === "string");
    if (questions.length > 0) return { text: questions.map((item) => item.question).join(" · "), path: false };
  }
  for (const key of ["title", "command", "file_path", "path", "query", "pattern", "url", "description", "prompt", "plan", "name", "content"]) {
    const value = arguments_[key];
    if (typeof value === "string" && value.length > 0) return { text: value, path: key === "file_path" || key === "path" };
  }
  return undefined;
}

export function toolStatus(tool: ToolCall, runState: AgentTurnState | null, confirmation: Confirmation | undefined, records: readonly TrajectoryEventProjection[]): ToolDisplayStatus {
  if (confirmation?.status === "rejected") return "denied";
  if (tool.status === "completed" || tool.status === "failed" || tool.status === "cancelled") return tool.status;
  if (runState === "interrupted") return "interrupted";
  if (runState === "cancelled" || runState === "completed" || runState === "failed") return "cancelled";
  if (confirmation?.status === "pending") return "waiting";
  if (isWaitingQuestion(tool, records)) return "waiting_input";
  if (tool.status === "running" && runState !== "tool_running" && runState !== "waiting_input") return "unknown";
  return tool.status;
}

export function toolDuration(toolId: string, records: readonly TrajectoryEventProjection[]): number | null {
  const events = records.filter((record) => record.entityId === toolId);
  const start = events.findLast((record) => record.eventType === "tool.started");
  const end = events.findLast((record) => ["tool.completed", "tool.failed", "tool.cancelled"].includes(record.eventType));
  if (start === undefined || end === undefined || end.sequence < start.sequence) return null;
  const milliseconds = Date.parse(end.occurredAt) - Date.parse(start.occurredAt);
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : null;
}

export function isWaitingQuestion(tool: ToolCall, records: readonly TrajectoryEventProjection[]): boolean {
  return tool.status === "running" && records.some((request) =>
    request.eventType === "question.requested" && request.payload.tool_call_id === tool.id &&
    !records.some((decision) => decision.eventType === "question.resolved" && decision.entityId === request.entityId));
}

/** Human-readable results belong in chat; complete payloads remain in the trace. */
export function toolOutcomeSummary(tool: ToolCall): string | null {
  if (tool.status !== "completed" || tool.result === null || typeof tool.result !== "object" || Array.isArray(tool.result)) return null;
  const result = tool.result as Readonly<Record<string, unknown>>;
  if (tool.name === "oge_find_regions" && Array.isArray(result.regions)) {
    return result.regions.map((value) => {
      if (value === null || typeof value !== "object" || !("name" in value) || typeof value.name !== "string") return "";
      return "code" in value ? `${value.name}（${String(value.code)}）` : value.name;
    }).filter(Boolean).join("、");
  }
  if (tool.name === "oge_search_operators" && Array.isArray(result.operators)) {
    return result.operators.map((value) => value !== null && typeof value === "object" && "name" in value ? String(value.name) : "").filter(Boolean).join("、");
  }
  if (tool.name === "oge_search_images" && typeof result.total === "number") return zhCN.conversation.tools.imageMatches(result.total);
  if (tool.name === "oge_get_operator_definition" && typeof result.description === "string") return result.description;
  if (tool.name === "oge_get_image_detail" && typeof result.productName === "string") return `${result.productName}${typeof result.phenomenonTime === "string" ? ` · ${result.phenomenonTime}` : ""}`;
  return null;
}
