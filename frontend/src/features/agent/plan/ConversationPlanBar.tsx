import { TodoItems } from "@/features/agent/plan/TodoItems";
import { selectCurrentTodos } from "@/features/agent/plan/todos";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { ChevronDown, ChevronRight } from "lucide-vue-next";
import { computed, defineComponent, shallowRef, toRefs } from "vue";
const copy = zhCN.conversation.planBar;
export const ConversationPlanBar = defineComponent(
  (
    componentProps: {
      readonly runId: string | null;
      readonly processing: boolean;
    },
    { slots: _slots },
  ) => {
    const runId = computed(() => componentProps.runId),
      processing = computed(() => componentProps.processing);
    const { events } = toRefs(useSessionEvents());
    const plan = computed(() => selectCurrentTodos(events.value));
    const expanded = shallowRef(true),
      setExpanded = refSetter(expanded);
    const completed = computed(
      () =>
        plan.value?.todos.filter((item) => item.status === "completed")
          .length ?? 0,
    );
    return () => {
      const _processing = processing.value,
        _plan = plan.value,
        _runId = runId.value,
        _completed = completed.value;
      if (
        !_processing ||
        _plan === null ||
        _plan.runId !== _runId ||
        _plan.todos.length === 0
      )
        return null;
      return (
        <div class="shrink-0 px-3" data-composer-zone>
          <div
            class="chat-surface-fluid border-t border-border py-1.5"
            data-testid="conversation-plan-bar"
          >
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-2 px-2 text-left text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-expanded={expanded.value}
              aria-label={expanded.value ? copy.collapse : copy.expand}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded.value ? (
                <ChevronDown class="size-3.5" />
              ) : (
                <ChevronRight class="size-3.5" />
              )}
              <span
                class="size-1.5 rounded-full bg-muted-foreground"
                aria-hidden="true"
              />
              <span class="text-[13px]">{copy.title}</span>
              <span class="text-xs">
                {copy.progress(_completed, _plan.todos.length)}
              </span>
            </button>
            {expanded.value && (
              <div class="max-h-[min(22vh,180px)] overflow-y-auto overscroll-contain pt-1.5 pr-2 pl-[30px]">
                <TodoItems items={_plan.todos} />
              </div>
            )}
          </div>
        </div>
      );
    };
  },
  {
    name: "ConversationPlanBar",
    inheritAttrs: false,
    props: ["runId", "processing"],
  },
);
