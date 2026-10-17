import ledger from "@/features/events/trajectory/styles/TrajectoryLedger.module.css";
import type { TrajectoryRecord } from "@/features/events/trajectory/trajectory-model";
import { zhCN } from "@/locales/zh-CN";

export const content = zhCN.trajectory;

export type Tab =
  | "summary"
  | "preview"
  | "input"
  | "output"
  | "raw"
  | "source"
  | "systemPrompt"
  | "toolDefinitions"
  | "model"
  | "changes"
  | "schema"
  | "timing"
  | "stream";

export function formatTime(value: string): string {
  return new Date(value).toLocaleString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

export function producerLabel(value: unknown): string {
  const labels = content.producers as Record<string, string>;
  return typeof value === "string" ? (labels[value] ?? value) : "—";
}

export function statusLabel(value: string): string {
  return (content.statuses as Record<string, string>)[value] ?? value;
}

export function tabLabel(tab: Tab): string {
  if (tab === "model") return zhCN.modelConnections.title;
  if (tab === "input") return content.payload;
  if (tab === "output") return content.result;
  return content[tab];
}

export function kindClass(record: TrajectoryRecord): string {
  return ledger[record.kind === "unsupported" ? "systemNeutral" : record.kind]!;
}
