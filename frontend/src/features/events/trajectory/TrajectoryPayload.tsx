import css from "@/features/events/trajectory/inspector/TrajectoryInspector.module.css";
import { zhCN } from "@/locales/zh-CN";
import { Copy } from "lucide-vue-next";
import { computed, defineComponent } from "vue";
import { toast } from "vue-sonner";
const content = zhCN.trajectory;
export function payloadText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
export const TrajectoryPayload = defineComponent(
  (
    componentProps: {
      value: unknown;
      tree?: boolean;
    },
    { slots: _slots },
  ) => {
    const value = computed(() => componentProps.value),
      tree = computed(() =>
        componentProps.tree === undefined ? false : componentProps.tree,
      );
    async function copy() {
      try {
        await navigator.clipboard.writeText(payloadText(value.value));
        toast.success(content.copied);
      } catch (error) {
        console.error("[trajectory] Copy failed", error);
        toast.error(content.copyFailed);
      }
    }
    return () => {
      const _tree = tree.value,
        _value = value.value;
      return (
        <div class={css.payload}>
          <button
            type="button"
            class={css.copy}
            title={content.copy}
            aria-label={content.copy}
            onClick={() => void copy()}
          >
            <Copy size={12} />
          </button>
          {_tree && _value !== null && typeof _value === "object" ? (
            <JsonNode value={_value} depth={0} />
          ) : (
            <pre class={css.sourceBlockContent}>{payloadText(_value)}</pre>
          )}
        </div>
      );
    };
  },
  {
    name: "TrajectoryPayload",
    inheritAttrs: false,
    props: ["value", "tree"],
  },
);
const JsonNode = defineComponent(
  (
    componentProps: {
      value: unknown;
      depth: number;
      name?: string;
    },
    { slots: _slots },
  ) => {
    const value = computed(() => componentProps.value),
      depth = computed(() => componentProps.depth),
      name = computed(() => componentProps.name);
    const label = computed(() =>
      name.value === undefined ? null : (
        <span class={css.jsonKey}>{name.value}: </span>
      ),
    );
    const entries = computed(() =>
      value.value !== null && typeof value.value === "object"
        ? Object.entries(value.value)
        : [],
    );
    const brackets = computed(() =>
      Array.isArray(value.value) ? ["[", "]"] : ["{", "}"],
    );
    return () => {
      const _value2 = value.value,
        _label = label.value,
        _entries = entries.value,
        _brackets = brackets.value,
        _depth = depth.value;
      if (_value2 === null || typeof _value2 !== "object")
        return (
          <div class={css.jsonLeaf}>
            {_label}
            <span
              class={
                typeof _value2 === "string" ? css.jsonString : css.jsonLiteral
              }
            >
              {JSON.stringify(_value2)}
            </span>
          </div>
        );
      if (_entries.length === 0)
        return (
          <div>
            {_label}
            {_brackets.join("")}
          </div>
        );
      return (
        <details open={_depth < 2} class={css.jsonNode}>
          <summary>
            {_label}
            {_brackets[0]}
            <span class={css.jsonCount}> {_entries.length} </span>
            {_brackets[1]}
          </summary>
          <div class={css.jsonChildren}>
            {_entries.map(([key, item]) => (
              <JsonNode key={key} name={key} value={item} depth={_depth + 1} />
            ))}
          </div>
        </details>
      );
    };
  },
  {
    name: "JsonNode",
    inheritAttrs: false,
    props: ["value", "depth", "name"],
  },
);
