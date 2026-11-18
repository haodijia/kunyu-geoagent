// Copyright 2025 AionUi (aionui.com)
// SPDX-License-Identifier: Apache-2.0
// Adapted from Mu/AionUi toolActivity and ToolKindIcon (Apache-2.0).
import type { AgentTurnState, ToolCall } from "@/features/agent/api";
import type { Confirmation } from "@/features/confirmations/api";
import type { TrajectoryEventProjection } from "@/features/events/projection/events";
import type { GeneratingTool } from "@/features/events/stream/stream-presentation";
import { toolJob } from "@/features/jobs/job-state";
import { zhCN } from "@/locales/zh-CN";
type ToolKind =
  "read" | "edit" | "shell" | "search" | "web" | "map" | "agent" | "other";
const content = zhCN.conversation.tools;
export type ToolDisplayStatus =
  | ToolCall["status"]
  | "denied"
  | "interrupted"
  | "unknown"
  | "waiting"
  | "waiting_input";
export interface ToolTargetValue {
  readonly text: string;
  readonly path: boolean;
}
const kinds: readonly (readonly [readonly string[], ToolKind])[] = [
  [["bash", "shell", "exec", "terminal", "command", "run"], "shell"],
  [
    ["write", "edit", "replace", "patch", "apply", "notebook", "create"],
    "edit",
  ],
  [["read", "cat", "view", "open", "file"], "read"],
  [["grep", "glob", "search", "find", "rg", "ls", "list"], "search"],
  [["web", "fetch", "browser", "url", "http", "curl", "navigate"], "web"],
  [
    [
      "hive",
      "delegate",
      "agent",
      "subagent",
      "subagents",
      "task",
      "bee",
      "swarm",
    ],
    "agent",
  ],
];
export function toolKind(name: string): ToolKind {
  if (name.startsWith("map_")) return "map";
  if (
    name === "skill" ||
    name === "oge_get_my_data_detail" ||
    name === "oge_get_image_detail" ||
    name === "oge_get_service_definition"
  )
    return "read";
  if (
    name === "oge_list_my_data" ||
    name === "oge_search_images" ||
    name === "oge_find_regions"
  )
    return "search";
  if (name.startsWith("oge_")) return "web";
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  for (const [terms, kind] of kinds)
    if (words.some((word) => terms.includes(word))) return kind;
  return "other";
}
export function toolLabel(name: string): string {
  const names = content.names;
  return Object.hasOwn(names, name) ? names[name as keyof typeof names] : name;
}

export function completedToolLabel(name: string): string {
  const labels: Readonly<Record<string, string>> = content.completed;
  return Object.hasOwn(labels, name) ? labels[name]! : toolLabel(name);
}

export function toolActivitySummary(
  items: readonly {
    readonly tool: ToolCall;
    readonly status: ToolDisplayStatus;
  }[],
  generating: readonly GeneratingTool[],
) {
  const recent = items.findLast(
    ({ status }) =>
      status === "running" ||
      status === "waiting" ||
      status === "waiting_input",
  );
  const lastGenerating = generating.at(-1);
  const failed = items.filter(({ status }) => status === "failed").length;
  if (lastGenerating !== undefined)
    return {
      label:
        lastGenerating.name === null
          ? content.generating
          : toolLabel(lastGenerating.name),
      active: true,
      failed,
    };
  if (recent !== undefined)
    return {
      label: content.callAria(
        toolLabel(recent.tool.name),
        content.status[recent.status],
      ),
      active: recent.status === "running",
      failed,
      iconTool: recent.tool.name,
    };
  if (!items.every(({ status }) => status === "completed"))
    return {
      label: content.activity.calls(items.length),
      active: false,
      failed,
    };

  const first = items[0]?.tool.name;
  const counts = new Map<ToolKind, number>();
  for (const { tool } of items) {
    const kind = toolKind(tool.name);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const label =
    items.length === 1 && first !== undefined
      ? completedToolLabel(first)
      : [...counts]
          .map(([kind, count]) => content.activity[kind](count))
          .join(" · ");
  return {
    label,
    active: false,
    failed,
    iconTool: counts.size === 1 ? first : undefined,
  };
}

export function toolTarget(
  arguments_: ToolCall["arguments"],
): ToolTargetValue | undefined {
  if (typeof arguments_.title === "string" && arguments_.title)
    return {
      text: arguments_.title,
      path: false,
    };
  if (typeof arguments_.image_id === "number")
    return {
      text: String(arguments_.image_id),
      path: false,
    };
  if (
    typeof arguments_.start_time === "string" &&
    typeof arguments_.end_time === "string"
  ) {
    return {
      text: `${arguments_.start_time} → ${arguments_.end_time}`,
      path: false,
    };
  }
  if (Array.isArray(arguments_.questions)) {
    const questions = arguments_.questions.filter(
      (
        item,
      ): item is {
        question: string;
      } =>
        typeof item === "object" &&
        item !== null &&
        "question" in item &&
        typeof item.question === "string",
    );
    if (questions.length > 0)
      return {
        text: questions.map((item) => item.question).join(" · "),
        path: false,
      };
  }
  for (const key of [
    "title",
    "command",
    "file_path",
    "path",
    "query",
    "keywords",
    "pattern",
    "url",
    "description",
    "prompt",
    "plan",
    "name",
    "content",
  ]) {
    const value = arguments_[key];
    if (typeof value === "string" && value.length > 0)
      return {
        text: value,
        path: key === "file_path" || key === "path",
      };
  }
  return undefined;
}

export function toolResultTarget(tool: ToolCall): ToolTargetValue | undefined {
  const { name, result } = tool;
  if (typeof result !== "object" || result === null) return undefined;
  if (
    name === "oge_get_my_data_detail" &&
    "assetName" in result &&
    typeof result.assetName === "string"
  )
    return { text: result.assetName, path: false };
  if (
    name === "map_focus" &&
    "title" in result &&
    typeof result.title === "string"
  )
    return { text: result.title, path: false };
  return undefined;
}
export function toolStatus(
  tool: ToolCall,
  runState: AgentTurnState | null,
  confirmation: Confirmation | undefined,
  records: readonly TrajectoryEventProjection[],
): ToolDisplayStatus {
  if (confirmation?.status === "rejected") return "denied";
  const job = toolJob(tool.id, records);
  if (job !== undefined) {
    if (job.status === "running" || job.status === "stopping") return "running";
    return job.status === "killed" ? "cancelled" : job.status;
  }
  if (
    tool.status === "completed" ||
    tool.status === "failed" ||
    tool.status === "cancelled"
  )
    return tool.status;
  if (runState === "interrupted") return "interrupted";
  if (
    runState === "cancelled" ||
    runState === "completed" ||
    runState === "failed"
  )
    return "cancelled";
  if (confirmation?.status === "pending") return "waiting";
  if (isWaitingQuestion(tool, records)) return "waiting_input";
  if (
    tool.status === "running" &&
    runState !== "tool_running" &&
    runState !== "waiting_input"
  )
    return "unknown";
  return tool.status;
}
export function toolDuration(
  toolId: string,
  records: readonly TrajectoryEventProjection[],
): number | null {
  const job = toolJob(toolId, records);
  if (job !== undefined && job.finished_at === null) return null;
  const events = records.filter((record) => record.entityId === toolId);
  const start = events.findLast(
    (record) => record.eventType === "tool.started",
  );
  const end = events.findLast((record) =>
    ["tool.completed", "tool.failed", "tool.cancelled"].includes(
      record.eventType,
    ),
  );
  if (start === undefined || end === undefined || end.sequence < start.sequence)
    return null;
  const milliseconds =
    Math.max(
      Date.parse(end.occurredAt),
      job === undefined ? 0 : job.finished_at! * 1_000,
    ) - Date.parse(start.occurredAt);
  return Number.isFinite(milliseconds) && milliseconds >= 0
    ? milliseconds
    : null;
}
export function isWaitingQuestion(
  tool: ToolCall,
  records: readonly TrajectoryEventProjection[],
): boolean {
  return (
    tool.status === "running" &&
    records.some(
      (request) =>
        request.eventType === "question.requested" &&
        request.payload.tool_call_id === tool.id &&
        !records.some(
          (decision) =>
            decision.eventType === "question.resolved" &&
            decision.entityId === request.entityId,
        ),
    )
  );
}
