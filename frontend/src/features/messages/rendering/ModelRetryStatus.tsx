import type { AgentTurn } from "@/features/agent/api";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import type { SessionEvent } from "@/features/events/api";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { LoaderCircle } from "lucide-vue-next";
import { computed, defineComponent, shallowRef, toRefs } from "vue";
interface RetryWait {
  readonly retry: number;
  readonly maximum: number | null;
  readonly deadline: number;
}
function retryWait(
  events: readonly SessionEvent[],
  turns: readonly AgentTurn[],
): RetryWait | null {
  const run = turns.find((turn) => turn.state === "model_running");
  if (run === undefined) return null;
  let pending: SessionEvent | null = null;
  for (const event of events) {
    if (event.run_id !== run.id) continue;
    if (event.event_type === "llm/retry") pending = event;
    if (
      [
        "llm/retry-started",
        "request.header",
        "run.completed",
        "run.failed",
        "run.cancelled",
        "run.interrupted",
      ].includes(event.event_type)
    )
      pending = null;
  }
  if (pending === null || pending.payload.step !== run.step) return null;
  const { retry, max_retries, delay_ms } = pending.payload;
  const started = Date.parse(pending.occurred_at);
  if (
    typeof retry !== "number" ||
    !Number.isSafeInteger(retry) ||
    typeof delay_ms !== "number" ||
    !Number.isFinite(delay_ms) ||
    !Number.isFinite(started) ||
    (max_retries !== null && typeof max_retries !== "number")
  )
    throw new Error("Invalid durable retry plan.");
  return {
    retry,
    maximum: max_retries,
    deadline: started + delay_ms,
  };
}
export const ModelRetryStatus = defineComponent(
  (
    componentProps: {
      readonly turns: readonly AgentTurn[];
    },
    { slots: _slots },
  ) => {
    const turns = computed(() => componentProps.turns);
    const { events } = toRefs(useSessionEvents());
    const waiting = computed(() => retryWait(events.value, turns.value));
    const now = shallowRef(Date.now()),
      setNow = refSetter(now);
    const deadline = computed(() => waiting.value?.deadline);
    watchMounted([() => deadline.value], () => {
      if (deadline.value === undefined) return;
      setNow(Date.now());
      const timer = setInterval(() => setNow(Date.now()), 250);
      return () => clearInterval(timer);
    });
    const seconds = computed(() =>
      Math.max(
        0,
        Math.ceil(((waiting.value?.deadline ?? now.value) - now.value) / 1_000),
      ),
    );
    const label = computed(() =>
      waiting.value === null
        ? ""
        : seconds.value > 0
          ? zhCN.conversation.modelRetry.waiting(
              waiting.value.retry,
              waiting.value.maximum,
              seconds.value,
            )
          : zhCN.conversation.modelRetry.connecting(
              waiting.value.retry,
              waiting.value.maximum,
            ),
    );
    return () => {
      const _waiting = waiting.value,
        _label = label.value;
      if (_waiting === null) return null;
      return (
        <div
          role="status"
          aria-live="polite"
          class="flex min-w-0 items-center gap-2 rounded-t-[20px] px-2.5 py-2.5 text-sm leading-5 text-muted-foreground"
          style={{
            background: "var(--thought-gradient)",
          }}
        >
          <LoaderCircle
            class="size-3.5 shrink-0 animate-spin"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate" title={_label}>
            {_label}
          </span>
        </div>
      );
    };
  },
  {
    name: "ModelRetryStatus",
    inheritAttrs: false,
    props: ["turns"],
  },
);
