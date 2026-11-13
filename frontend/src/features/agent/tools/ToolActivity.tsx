import type { AgentTurnState, ToolCall } from "@/features/agent/api";
import { toolLabel } from "@/features/agent/tools/tool-presentation";
import styles from "@/features/agent/tools/ToolActivity.module.css";
import {
  ToolDetail,
  ToolKindIcon,
  ToolStatusBadge,
} from "@/features/agent/tools/ToolActivityParts";
import { ToolCallRow } from "@/features/agent/tools/ToolCallRow";
import type { Confirmation } from "@/features/confirmations/api";
import type { GeneratingTool } from "@/features/events/stream/stream-presentation";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { Down, Right } from "@icon-park/vue-next";
import { computed, defineComponent, shallowRef } from "vue";
const content = zhCN.conversation.tools;
export const GeneratingToolActivity = defineComponent(
  (
    componentProps: {
      readonly tools: readonly GeneratingTool[];
    },
    { slots: _slots },
  ) => {
    const tools = computed(() => componentProps.tools);
    return () => {
      const _tools = tools.value;
      return (
        <div
          class={styles.summary}
          role="group"
          aria-label={content.generating}
        >
          {_tools.map((tool) => (
            <GeneratingToolRow key={tool.index} tool={tool} />
          ))}
        </div>
      );
    };
  },
  {
    name: "GeneratingToolActivity",
    inheritAttrs: false,
    props: ["tools"],
  },
);
const GeneratingToolRow = defineComponent(
  (
    componentProps: {
      readonly tool: GeneratingTool;
    },
    { slots: _slots },
  ) => {
    const tool = computed(() => componentProps.tool);
    const expanded = shallowRef(false),
      setExpanded = refSetter(expanded);
    const name = computed(() =>
      tool.value.name === null ? content.title : toolLabel(tool.value.name),
    );
    return () => {
      const _name = name.value,
        _tool = tool.value;
      return (
        <div class={styles.call}>
          <button
            type="button"
            class={styles.callButton}
            aria-label={content.callAria(_name, content.generating)}
            aria-expanded={expanded.value}
            onClick={() => setExpanded((value) => !value)}
          >
            <ToolStatusBadge status="running" label={content.generating} />
            {_tool.name !== null && <ToolKindIcon name={_tool.name} />}
            <span class={styles.callName}>{_name}</span>
            <code class={styles.callPreview}>{_tool.arguments}</code>
            {expanded.value ? (
              <Down size={12} aria-hidden="true" />
            ) : (
              <Right size={12} aria-hidden="true" />
            )}
          </button>
          {expanded.value && (
            <div class={styles.detailPanel}>
              <ToolDetail label={content.generating} text={_tool.arguments} />
            </div>
          )}
        </div>
      );
    };
  },
  {
    name: "GeneratingToolRow",
    inheritAttrs: false,
    props: ["tool"],
  },
);
export const ToolActivity = defineComponent(
  (
    componentProps: {
      readonly confirmations: readonly Confirmation[];
      readonly tools: readonly ToolCall[];
      readonly runState: AgentTurnState | null;
    },
    { slots: _slots },
  ) => {
    const confirmations = computed(() => componentProps.confirmations),
      tools = computed(() => componentProps.tools),
      runState = computed(() => componentProps.runState);
    return () => {
      const _tools2 = tools.value,
        _confirmations = confirmations.value,
        _runState = runState.value;
      if (_tools2.length === 0) return null;
      return (
        <div class={styles.summary} role="group" aria-label={content.title}>
          {_tools2.map((tool) => (
            <ToolCallRow
              key={tool.id}
              tool={tool}
              confirmation={_confirmations.find(
                (item) => item.tool_call_id === tool.id,
              )}
              runState={_runState}
            />
          ))}
        </div>
      );
    };
  },
  {
    name: "ToolActivity",
    inheritAttrs: false,
    props: ["confirmations", "tools", "runState"],
  },
);
