import type { TodoItem } from "@/features/agent/plan/todos";
import { CheckCircle2, Circle } from "lucide-vue-next";
import { computed, defineComponent } from "vue";
export const TodoItems = defineComponent(
  (
    componentProps: {
      readonly items: readonly TodoItem[];
    },
    { slots: _slots },
  ) => {
    const items = computed(() => componentProps.items);
    return () => {
      const _items = items.value;
      return (
        <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
          {_items.map((item) => (
            <li
              key={item.content}
              class="flex items-start gap-2 text-[13px] leading-5 text-secondary-foreground"
            >
              {item.status === "completed" ? (
                <CheckCircle2
                  class="mt-0.5 size-4 shrink-0 text-success"
                  aria-hidden="true"
                />
              ) : (
                <Circle
                  class="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              )}
              <span
                class={
                  item.status === "in_progress"
                    ? "text-foreground [overflow-wrap:anywhere]"
                    : "[overflow-wrap:anywhere]"
                }
              >
                {item.content}
              </span>
            </li>
          ))}
        </ul>
      );
    };
  },
  {
    name: "TodoItems",
    inheritAttrs: false,
    props: ["items"],
  },
);
