import { computed, defineComponent } from "vue";
// Adapted from Mu HiveToolCard's compact row layout (Apache-2.0, AionUi).
import { ToolStatusBadge } from "@/features/agent/tools/ToolActivityParts";
import { toolLabel } from "@/features/agent/tools/tool-presentation";
import { useSubagents } from "@/features/subagents/SubagentContext";
import type { Subagent } from "@/features/subagents/api";
import css from "@/features/subagents/subagents.module.css";
import { zhCN } from "@/locales/zh-CN";
import { ChevronRight, Users } from "lucide-vue-next";
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
export const SubagentCard = defineComponent(
  (
    componentProps: {
      readonly toolCallId: string;
    },
    { slots: _slots },
  ) => {
    const toolCallId = computed(() => componentProps.toolCallId);
    const state = useSubagents();
    const children = computed(() =>
      state.query.data?.filter(
        (child) => child.tool_call_id === toolCallId.value,
      ),
    );
    return () => {
      const _children = children.value,
        _toolCallId = toolCallId.value;
      if (state.query.isError)
        return (
          <div class={css.notice} role="alert">
            {zhCN.subagents.loadFailed}
            <button type="button" onClick={() => void state.query.refetch()}>
              {zhCN.conversation.retry}
            </button>
          </div>
        );
      if (_children === undefined || _children.length === 0)
        return state.query.isFetching ? (
          <p class={css.notice} role="status">
            {zhCN.subagents.loading}
          </p>
        ) : null;
      return (
        <section
          class={css.card}
          aria-label={zhCN.subagents.title}
          data-subagent-card={_toolCallId}
        >
          <div class={css.heading}>
            <Users size={14} />
            <span>{zhCN.subagents.title}</span>
            <span class={css.count}>
              {zhCN.subagents.count(
                _children.filter((child) => child.status === "completed")
                  .length,
                _children.length,
              )}
            </span>
          </div>
          {_children.map((child) => (
            <button
              type="button"
              key={child.child_id}
              class={css.row}
              onClick={() => state.open(child.child_id)}
              aria-label={zhCN.subagents.inspect(child.description)}
              data-subagent={child.child_id}
            >
              <ToolStatusBadge
                status={childStatus(child)}
                label={zhCN.subagents.status[child.status]}
              />
              <span class={css.name} title={child.description}>
                {child.description}
              </span>
              <span class={css.model} title={child.model_snapshot.model_id}>
                {child.model_snapshot.model_id}
              </span>
              <span
                class={child.status === "failed" ? css.failed : css.activity}
                title={childLine(child)}
              >
                {childLine(child)}
              </span>
              <ChevronRight size={12} />
            </button>
          ))}
        </section>
      );
    };
  },
  {
    name: "SubagentCard",
    inheritAttrs: false,
    props: ["toolCallId"],
  },
);
