import type { TrajectoryEventKind } from "@/features/events/projection/events";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.trajectory;

export function kindLabel(kind: TrajectoryEventKind): string {
  switch (kind) {
    case "system":
      return content.system;
    case "context":
      return content.context;
    case "user":
      return content.user;
    case "assistant":
      return content.assistant;
    case "tool":
      return content.tool;
    case "confirmation":
      return content.confirmation;
    case "unsupported":
      return content.unsupported;
  }
}
