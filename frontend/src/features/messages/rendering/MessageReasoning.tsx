import { refSetter, watchMounted } from "@/lib/lifecycle";
import { computed, defineComponent, shallowRef } from "vue";
// Adapted from mu's MessageThinking (Apache-2.0, Copyright 2025 AionUi).
import {
  thoughtTail,
  type MessageReasoning as Reasoning,
} from "@/features/messages/model/reasoning";
import { zhCN } from "@/locales/zh-CN";
import { Brain, ChevronRight, LoaderCircle } from "lucide-vue-next";
const content = zhCN.conversation.thinking;
export const MessageReasoning = defineComponent(
  (
    componentProps: {
      readonly id: string;
      readonly reasoning: Reasoning;
      readonly active: boolean;
      readonly updatedAt: string;
    },
    { slots: _slots },
  ) => {
    const id = computed(() => componentProps.id),
      reasoning = computed(() => componentProps.reasoning),
      active = computed(() => componentProps.active),
      updatedAt = computed(() => componentProps.updatedAt);
    const expanded = shallowRef(false),
      setExpanded = refSetter(expanded);
    const now = shallowRef(Date.now()),
      setNow = refSetter(now);
    const bodyRef = shallowRef<HTMLDivElement | null>(null);
    watchMounted([() => active.value, () => reasoning.value.startedAt], () => {
      if (!active.value) return;
      setNow(Date.now());
      const timer = setInterval(() => setNow(Date.now()), 1_000);
      return () => clearInterval(timer);
    });
    watchMounted(
      [() => reasoning.value.text, () => active.value, () => expanded.value],
      () => {
        if (active.value && expanded.value && bodyRef.value !== null) {
          bodyRef.value.scrollTop = bodyRef.value.scrollHeight;
        }
      },
    );
    const ended = computed(() =>
      reasoning.value.finishedAt === null
        ? active.value
          ? now.value
          : Date.parse(updatedAt.value)
        : Date.parse(reasoning.value.finishedAt),
    );
    const seconds = computed(() =>
      Math.max(
        0,
        Math.floor(
          (ended.value - Date.parse(reasoning.value.startedAt)) / 1_000,
        ),
      ),
    );
    const duration = computed(() =>
      seconds.value >= 60
        ? content.minutes(Math.floor(seconds.value / 60), seconds.value % 60)
        : content.seconds(seconds.value),
    );
    const tail = computed(() => thoughtTail(reasoning.value.text));
    return () => {
      const _id = id.value,
        _active = active.value,
        _duration = duration.value,
        _tail = tail.value,
        _reasoning = reasoning.value;
      return (
        <div class="message-thinking">
          <button
            type="button"
            class="message-thinking-header"
            aria-expanded={expanded.value}
            aria-controls={`thought-${_id}`}
            onClick={() => setExpanded((value) => !value)}
          >
            {_active ? (
              <LoaderCircle class="size-3.5 animate-spin" />
            ) : (
              <Brain class="size-3.5" />
            )}
            <span>
              {_active
                ? content.running(_duration)
                : content.completed(_duration)}
            </span>
            <ChevronRight
              class={`size-3 transition-transform ${expanded.value ? "rotate-90" : ""}`}
            />
          </button>
          {_active && !expanded.value && _tail.length > 0 && (
            <div class="message-thinking-stream" aria-hidden="true">
              {_tail}
            </div>
          )}
          {expanded.value && (
            <div
              ref={bodyRef}
              id={`thought-${_id}`}
              class="message-thinking-body"
            >
              {_reasoning.text}
            </div>
          )}
        </div>
      );
    };
  },
  {
    name: "MessageReasoning",
    inheritAttrs: false,
    props: ["id", "reasoning", "active", "updatedAt"],
  },
);
