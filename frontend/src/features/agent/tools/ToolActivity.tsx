import type { AgentTurnState, ToolCall } from "@/features/agent/api";
import {
  toolActivitySummary,
  toolLabel,
  toolStatus,
} from "@/features/agent/tools/tool-presentation";
import styles from "@/features/agent/tools/ToolActivity.module.css";
import {
  ToolDetail,
  ToolKindIcon,
  ToolStatusBadge,
} from "@/features/agent/tools/ToolActivityParts";
import { ToolCallRow } from "@/features/agent/tools/ToolCallRow";
import type { Confirmation } from "@/features/confirmations/api";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import type { GeneratingTool } from "@/features/events/stream/stream-presentation";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { ChevronRight, Layers, LoaderCircle } from "lucide-vue-next";
import { computed, defineComponent, shallowRef } from "vue";
const content = zhCN.conversation.tools;
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
            <ChevronRight size={12} aria-hidden="true" />
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
      readonly generatingTools: readonly GeneratingTool[];
      readonly runState: AgentTurnState | null;
    },
    { slots: _slots },
  ) => {
    const stream = useSessionEvents();
    const detailsMounted = shallowRef(false);
    const items = computed(() =>
      componentProps.tools.map((tool) => {
        const confirmation = componentProps.confirmations.find(
          (item) => item.tool_call_id === tool.id,
        );
        return {
          tool,
          confirmation,
          status: toolStatus(
            tool,
            componentProps.runState,
            confirmation,
            stream.records,
          ),
        };
      }),
    );
    const activity = computed(() =>
      toolActivitySummary(items.value, componentProps.generatingTools),
    );
    return () => {
      const { label, active, failed, iconTool } = activity.value;
      return (
        <details
          class={styles.activity}
          onToggle={(event) => {
            if ((event.currentTarget as HTMLDetailsElement).open)
              detailsMounted.value = true;
          }}
        >
          <summary class={styles.activityHeader}>
            {active ? (
              <LoaderCircle
                size={14}
                class="shrink-0 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : iconTool ? (
              <ToolKindIcon name={iconTool} />
            ) : (
              <Layers size={14} aria-hidden="true" />
            )}
            <span class={styles.activityLabel}>{label}</span>
            {failed > 0 && (
              <span class="text-destructive">
                {content.activity.failed(failed)}
              </span>
            )}
            <ChevronRight
              size={14}
              class={styles.disclosureIcon}
              aria-hidden="true"
            />
          </summary>
          {detailsMounted.value && (
            <div class={styles.activityItems}>
              {items.value.map(({ tool, confirmation, status }) => (
                <ToolCallRow
                  key={tool.id}
                  tool={tool}
                  confirmation={confirmation}
                  status={status}
                />
              ))}
              {componentProps.generatingTools.map((tool) => (
                <GeneratingToolRow key={tool.id} tool={tool} />
              ))}
            </div>
          )}
        </details>
      );
    };
  },
  {
    name: "ToolActivity",
    inheritAttrs: false,
    props: ["confirmations", "tools", "generatingTools", "runState"],
  },
);
