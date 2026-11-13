import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { Check, X } from "lucide-vue-next";
import { computed, defineComponent, shallowRef, useId } from "vue";
interface SidebarNameFormProps {
  readonly error: string | null;
  readonly initialValue?: string;
  readonly label: string;
  readonly pending: boolean;
  readonly placeholder: string;
  readonly onCancel: () => void;
  readonly onSubmit: (value: string) => void;
}
export const SidebarNameForm = defineComponent(
  (componentProps: SidebarNameFormProps, { slots: _slots }) => {
    const error = computed(() => componentProps.error),
      initialValue = computed(() =>
        componentProps.initialValue === undefined
          ? ""
          : componentProps.initialValue,
      ),
      label = computed(() => componentProps.label),
      pending = computed(() => componentProps.pending),
      placeholder = computed(() => componentProps.placeholder),
      onCancel = computed(() => componentProps.onCancel),
      onSubmit = computed(() => componentProps.onSubmit);
    const inputId = useId();
    const value = shallowRef(initialValue.value),
      setValue = refSetter(value);
    function handleSubmit(event: SubmitEvent) {
      event.preventDefault();
      onSubmit.value(value.value.trim());
    }
    return () => {
      const _pending = pending.value,
        _onCancel = onCancel.value,
        _label = label.value,
        _placeholder = placeholder.value,
        _error = error.value;
      return (
        <form
          class="@container min-w-0 px-2 py-1"
          onSubmit={handleSubmit}
          onKeydown={(event) => {
            if (event.key === "Escape" && !_pending) {
              event.preventDefault();
              _onCancel();
            }
          }}
        >
          <label class="sr-only" for={inputId}>
            {_label}
          </label>
          <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-1 @[240px]:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              id={inputId}
              class="h-8 w-full px-2"
              value={value.value}
              onInput={(event) =>
                setValue((event.target as HTMLInputElement).value)
              }
              placeholder={_placeholder}
              maxlength={200}
              autofocus
              required
              disabled={_pending}
              onFocus={(event) =>
                (event.currentTarget as HTMLInputElement).select()
              }
            />
            <div class="flex shrink-0 items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                type="submit"
                class="size-8 text-secondary-foreground"
                aria-label={_label}
                disabled={_pending || value.value.trim().length === 0}
              >
                <Check class="size-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                class="size-8 text-muted-foreground"
                onClick={_onCancel}
                aria-label={zhCN.workspaceSidebar.cancel}
                disabled={_pending}
              >
                <X class="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          {_error === null ? null : (
            <p
              class="m-0 mt-1.5 text-xs leading-4 text-destructive [overflow-wrap:anywhere]"
              role="alert"
            >
              {_error}
            </p>
          )}
        </form>
      );
    };
  },
  {
    name: "SidebarNameForm",
    inheritAttrs: false,
    props: [
      "error",
      "initialValue",
      "label",
      "pending",
      "placeholder",
      "onCancel",
      "onSubmit",
    ],
  },
);
