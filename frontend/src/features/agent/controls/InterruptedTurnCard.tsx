import { Button } from "@/components/ui/button";
import type { AgentTurn } from "@/features/agent/api";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import { AlertTriangle, LoaderCircle, RotateCw, Square } from "lucide-vue-next";
import { computed, defineComponent } from "vue";
type InterruptionAction = "cancel" | "resume";
export const InterruptedTurnCard = defineComponent(
  (
    componentProps: {
      readonly class: string;
      readonly turn: AgentTurn;
      readonly pendingAction: InterruptionAction | undefined;
      readonly onResume: () => void;
      readonly onCancel: () => void;
      readonly error: string | null;
    },
    { slots: _slots },
  ) => {
    const className = computed(() => componentProps.class),
      turn = computed(() => componentProps.turn),
      pendingAction = computed(() => componentProps.pendingAction),
      onResume = computed(() => componentProps.onResume),
      onCancel = computed(() => componentProps.onCancel),
      error = computed(() => componentProps.error);
    const content = zhCN.conversation.interruption;
    const description = computed(() =>
      turn.value.state === "ready"
        ? content.readyDescription
        : turn.value.resume_phase === "tool"
          ? content.toolDescription
          : content.modelDescription,
    );
    return () => {
      const _className = className.value,
        _turn = turn.value,
        _description = description.value,
        _pendingAction = pendingAction.value,
        _onCancel = onCancel.value,
        _onResume = onResume.value,
        _error = error.value;
      return (
        <aside
          class={cn(_className, "px-4 py-3.5")}
          aria-labelledby={`interrupted-${_turn.id}`}
        >
          <div class="flex flex-wrap items-start gap-3">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
              <AlertTriangle
                class="size-4.5"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </span>
            <div class="min-w-52 flex-1">
              <h3
                id={`interrupted-${_turn.id}`}
                class="m-0 font-semibold text-foreground"
              >
                {_turn.state === "ready" ? content.readyTitle : content.title}
              </h3>
              <p class="mt-1 mb-0 leading-5 text-muted-foreground">
                {_description}
              </p>
              <p class="mt-1 mb-0 text-xs leading-5 text-muted-foreground">
                {content.snapshot(_turn.model_snapshot.model_id, _turn.attempt)}
              </p>
            </div>
            <div class="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={_pendingAction !== undefined}
                onClick={_onCancel}
              >
                {_pendingAction === "cancel" ? (
                  <LoaderCircle
                    class="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Square class="size-3" aria-hidden="true" />
                )}
                {_pendingAction === "cancel"
                  ? content.cancelling
                  : content.cancel}
              </Button>
              <Button
                size="sm"
                disabled={_pendingAction !== undefined}
                onClick={_onResume}
              >
                {_pendingAction === "resume" ? (
                  <LoaderCircle
                    class="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <RotateCw class="size-3.5" aria-hidden="true" />
                )}
                {_pendingAction === "resume"
                  ? content.resuming
                  : content.resume}
              </Button>
            </div>
          </div>
          {_error !== null ? (
            <p class="mt-2 mb-0 text-xs text-destructive" role="alert">
              {_error}
            </p>
          ) : null}
        </aside>
      );
    };
  },
  {
    name: "InterruptedTurnCard",
    inheritAttrs: false,
    props: ["turn", "pendingAction", "onResume", "onCancel", "error"],
  },
);
