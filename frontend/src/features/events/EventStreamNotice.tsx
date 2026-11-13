import type { EventStreamStatus } from "@/features/events/SessionEventContext";
import { zhCN } from "@/locales/zh-CN";
import { LoaderCircle, TriangleAlert } from "lucide-vue-next";
import { computed, defineComponent } from "vue";
const content = zhCN.trajectory;
interface EventStreamNoticeProps {
  readonly error: string | null;
  readonly status: EventStreamStatus;
}
export const EventStreamNotice = defineComponent(
  (componentProps: EventStreamNoticeProps, { slots: _slots }) => {
    const error = computed(() => componentProps.error),
      status = computed(() => componentProps.status);
    const failed = computed(() => status.value === "failed");
    const Icon = computed(() => (failed.value ? TriangleAlert : LoaderCircle));
    const label = computed(() =>
      status.value === "connecting"
        ? content.connecting
        : failed.value
          ? content.failed
          : content.reconnecting,
    );
    return () => {
      const _status = status.value,
        _failed = failed.value,
        _error = error.value,
        _label = label.value;
      if (_status === "connected") {
        return null;
      }
      return (
        <div
          class={
            _failed
              ? "flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
              : "flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning"
          }
          role={_failed ? "alert" : "status"}
          title={_error ?? undefined}
        >
          <Icon.value
            class={_failed ? "size-3.5" : "size-3.5 animate-spin"}
            aria-hidden="true"
          />
          <span>{_label}</span>
        </div>
      );
    };
  },
  {
    name: "EventStreamNotice",
    inheritAttrs: false,
    props: ["error", "status"],
  },
);
