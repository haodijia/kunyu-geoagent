import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PlanPreview } from "@/features/plans/PlanPreview";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { X } from "lucide-vue-next";
import {
  computed,
  defineComponent,
  inject,
  provide,
  reactive,
  shallowRef,
  type InjectionKey,
  type VNodeChild,
} from "vue";
interface PlanReaderState {
  readonly document: {
    readonly toolId: string;
    readonly title: string;
  } | null;
  readonly reviewed: readonly string[];
}
interface PlanReaderActions {
  readonly openPlan: (toolId: string, title: string) => void;
  readonly openReview: (
    questionId: string,
    toolId: string,
    title: string,
  ) => void;
}
const PlanReaderContext: InjectionKey<PlanReaderActions | null> =
  Symbol("PlanReaderContext");
const emptyState: PlanReaderState = {
  document: null,
  reviewed: [],
};
function readState(key: string): PlanReaderState {
  const stored = sessionStorage.getItem(key);
  if (stored === null) return emptyState;
  const state: unknown = JSON.parse(stored);
  if (
    typeof state !== "object" ||
    state === null ||
    !("document" in state) ||
    !("reviewed" in state) ||
    !Array.isArray(state.reviewed) ||
    !state.reviewed.every((id) => typeof id === "string" && id.length > 0) ||
    (state.document !== null &&
      (typeof state.document !== "object" ||
        !("toolId" in state.document) ||
        typeof state.document.toolId !== "string" ||
        !state.document.toolId ||
        !("title" in state.document) ||
        typeof state.document.title !== "string" ||
        !state.document.title))
  ) {
    throw new Error("Invalid plan reader state.");
  }
  return state as PlanReaderState;
}
export const PlanDocumentProvider = defineComponent(
  (
    componentProps: {
      readonly sessionId: string;
      readonly children?: VNodeChild;
    },
    { slots },
  ) => {
    const sessionId = computed(() => componentProps.sessionId),
      children = () => slots.default?.();
    const key = computed(() => `kunyu.session.${sessionId.value}.plan-reader`);
    const initial = shallowRef(
      (() => {
        try {
          return {
            state: readState(key.value),
            error: null,
          };
        } catch (error) {
          console.error("[plans] Reader state could not be restored.", error);
          return {
            state: emptyState,
            error: zhCN.planReview.stateReadFailed,
          };
        }
      })(),
    );
    const state = shallowRef(initial.value.state),
      setState = refSetter(state);
    const storageError = shallowRef<string | null>(initial.value.error),
      setStorageError = refSetter(storageError);
    const readFailed = shallowRef(initial.value.error !== null);
    const reviewed = shallowRef(new Set(state.value.reviewed));
    watchMounted([() => key.value, () => state.value], () => {
      if (readFailed.value) return;
      try {
        sessionStorage.setItem(key.value, JSON.stringify(state.value));
        setStorageError(null);
      } catch (error) {
        console.error("[plans] Reader state could not be saved.", error);
        setStorageError(zhCN.planReview.stateWriteFailed);
      }
    });
    const openPlan = (toolId: string, title: string) => {
      if (!readFailed.value)
        setState((current) => ({
          ...current,
          document: {
            toolId,
            title,
          },
        }));
    };
    const openReview = (questionId: string, toolId: string, title: string) => {
      if (readFailed.value || reviewed.value.has(questionId)) return;
      reviewed.value.add(questionId);
      setState({
        document: {
          toolId,
          title,
        },
        reviewed: [...reviewed.value],
      });
    };
    function reset() {
      try {
        sessionStorage.removeItem(key.value);
        readFailed.value = false;
        reviewed.value.clear();
        setState(emptyState);
        setStorageError(null);
      } catch (error) {
        console.error("[plans] Reader state could not be cleared.", error);
        setStorageError(zhCN.planReview.stateReadFailed);
      }
    }
    provide(
      PlanReaderContext,
      reactive({
        get openPlan() {
          return openPlan;
        },
        get openReview() {
          return openReview;
        },
      }),
    );
    return () => {
      return (
        <>
          {storageError.value !== null && (
            <div
              role="alert"
              class="flex items-center gap-2 px-4 py-2 text-xs text-destructive"
            >
              {storageError.value}
              {readFailed.value && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  {zhCN.planReview.resetState}
                </Button>
              )}
            </div>
          )}
          {children()}
          <AlertDialog
            open={state.value.document !== null}
            onUpdate:open={(open) => {
              if (!open)
                setState((current) => ({
                  ...current,
                  document: null,
                }));
            }}
          >
            <AlertDialogContent
              role="dialog"
              class="flex h-[85dvh] min-h-0 max-w-3xl flex-col gap-0 overflow-hidden p-0"
            >
              <div class="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
                <div class="min-w-0 flex-1">
                  <AlertDialogTitle class="truncate">
                    {state.value.document?.title}
                  </AlertDialogTitle>
                  <AlertDialogDescription class="mt-1">
                    {zhCN.planReview.document}
                  </AlertDialogDescription>
                </div>
                <AlertDialogCancel asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={zhCN.planReview.close}
                  >
                    <X class="size-4" />
                  </Button>
                </AlertDialogCancel>
              </div>
              {state.value.document !== null && (
                <PlanPreview toolId={state.value.document.toolId} />
              )}
            </AlertDialogContent>
          </AlertDialog>
        </>
      );
    };
  },
  {
    name: "PlanDocumentProvider",
    inheritAttrs: false,
    props: ["sessionId"],
  },
);
export function usePlanDocument(): PlanReaderActions {
  const reader = inject(PlanReaderContext, null);
  if (reader === null) throw new Error("Plan document provider is required.");
  return reader;
}
