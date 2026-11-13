import { Button } from "@/components/ui/button";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { zhCN } from "@/locales/zh-CN";
import { CircleX, ClipboardList } from "lucide-vue-next";
import { computed, defineComponent, toRefs } from "vue";
export const ComposerPlanChip = defineComponent(
  (
    componentProps: {
      readonly locked: boolean;
      readonly onExit: () => void;
    },
    { slots: _slots },
  ) => {
    const locked = computed(() => componentProps.locked),
      onExit = computed(() => componentProps.onExit);
    const { plan, status } = toRefs(useSessionEvents());
    const copy = zhCN.conversation.planMode;
    return () => {
      const _locked = locked.value,
        _onExit = onExit.value;
      if (plan.value === null || !(plan.value.pending ?? plan.value.active))
        return null;
      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="group h-7 shrink-0 gap-1 rounded-full bg-primary/20 px-2 text-[12px] font-medium text-foreground hover:bg-primary/30 hover:text-foreground"
          data-testid="composer-plan-chip"
          data-pending={plan.value.pending !== null}
          aria-label={copy.exit}
          title={plan.value.pending === null ? copy.exit : copy.pending}
          disabled={_locked || status.value !== "connected"}
          onClick={_onExit}
        >
          <span class="relative size-3.5">
            <ClipboardList
              aria-hidden="true"
              class="absolute size-3.5 group-enabled:group-hover:hidden group-enabled:group-focus-visible:hidden"
            />
            <CircleX
              aria-hidden="true"
              class="absolute hidden size-3.5 group-enabled:group-hover:block group-enabled:group-focus-visible:block"
            />
          </span>
          {copy.label}
        </Button>
      );
    };
  },
  {
    name: "ComposerPlanChip",
    inheritAttrs: false,
    props: ["locked", "onExit"],
  },
);
