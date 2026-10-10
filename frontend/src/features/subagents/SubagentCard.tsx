// Adapted from Mu HiveToolCard's compact row layout (Apache-2.0, AionUi).
import { ChevronRight, Users } from "lucide-react";
import { ToolStatusBadge } from "@/features/agent/ToolActivityParts";
import { toolLabel } from "@/features/agent/tool-presentation";
import { zhCN } from "@/locales/zh-CN";
import { useSubagents } from "./SubagentContext";
import type { Subagent } from "./api";
import css from "./subagents.module.css";

export function childStatus(child: Subagent) {
  return child.status === "model_running" || child.status === "tool_running"
    ? "running"
    : child.status === "ready" || child.status === "queued"
      ? "pending"
      : child.status === "waiting_confirmation"
        ? "waiting"
        : child.status;
}
export function childLine(child: Subagent): string {
  if (child.reason !== null) return child.reason;
  if (child.active_tool !== null) return toolLabel(child.active_tool);
  if (child.output !== null && child.output.trim() !== "")
    return child.output.trim().split("\n")[0]!;
  return zhCN.subagents.status[child.status];
}
export function SubagentCard({ toolCallId }: { readonly toolCallId: string }) {
  const state = useSubagents();
  const children = state.query.data?.filter(
    (child) => child.tool_call_id === toolCallId,
  );
  if (state.query.isError)
    return (
      <div className={css.notice} role="alert">
        {zhCN.subagents.loadFailed}
        <button type="button" onClick={() => void state.query.refetch()}>
          {zhCN.conversation.retry}
        </button>
      </div>
    );
  if (children === undefined || children.length === 0)
    return state.query.isFetching ? (
      <p className={css.notice} role="status">
        {zhCN.subagents.loading}
      </p>
    ) : null;
  return (
    <section
      className={css.card}
      aria-label={zhCN.subagents.title}
      data-subagent-card={toolCallId}
    >
      <div className={css.heading}>
        <Users size={14} />
        <span>{zhCN.subagents.title}</span>
        <span className={css.count}>
          {zhCN.subagents.count(
            children.filter((child) => child.status === "completed").length,
            children.length,
          )}
        </span>
      </div>
      {children.map((child) => (
        <button
          type="button"
          key={child.child_id}
          className={css.row}
          onClick={() => state.open(child.child_id)}
          aria-label={zhCN.subagents.inspect(child.description)}
          data-subagent={child.child_id}
        >
          <ToolStatusBadge
            status={childStatus(child)}
            label={zhCN.subagents.status[child.status]}
          />
          <span className={css.name} title={child.description}>
            {child.description}
          </span>
          <span className={css.model} title={child.model_snapshot.model_id}>
            {child.model_snapshot.model_id}
          </span>
          <span
            className={child.status === "failed" ? css.failed : css.activity}
            title={childLine(child)}
          >
            {childLine(child)}
          </span>
          <ChevronRight size={12} />
        </button>
      ))}
    </section>
  );
}
