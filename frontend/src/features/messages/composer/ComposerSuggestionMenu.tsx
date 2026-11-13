import { watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { computed, defineComponent, shallowRef } from "vue";
export interface ComposerSuggestion {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly detail: string | null;
  readonly inputHint: string | null;
  readonly unavailableReason: string | null;
}
interface ComposerSuggestionMenuProps {
  readonly id: string;
  readonly items: readonly ComposerSuggestion[];
  readonly copy: {
    readonly title: string;
    readonly loading: string;
    readonly empty: string;
  };
  readonly activeIndex: number;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onSelect: (index: number) => void;
  readonly onRetry?: () => void;
}
export const ComposerSuggestionMenu = defineComponent(
  (componentProps: ComposerSuggestionMenuProps, { slots: _slots }) => {
    const id = computed(() => componentProps.id),
      items = computed(() => componentProps.items),
      copy = computed(() => componentProps.copy),
      activeIndex = computed(() => componentProps.activeIndex),
      pending = computed(() => componentProps.pending),
      error = computed(() => componentProps.error),
      onActiveIndexChange = computed(() => componentProps.onActiveIndexChange),
      onSelect = computed(() => componentProps.onSelect),
      onRetry = computed(() => componentProps.onRetry);
    const listRef = shallowRef<HTMLDivElement | null>(null);
    watchMounted([() => activeIndex.value], () => {
      listRef.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({
        block: "nearest",
      });
    });
    return () => {
      const _copy = copy.value,
        _id = id.value,
        _pending = pending.value,
        _error = error.value,
        _onRetry = onRetry.value,
        _items = items.value,
        _activeIndex = activeIndex.value,
        _onActiveIndexChange = onActiveIndexChange.value,
        _onSelect = onSelect.value;
      return (
        <div class="absolute inset-x-0 bottom-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-md">
          <div class="flex items-center justify-between px-2 py-1.5 text-[11px] text-muted-foreground">
            <span>{_copy.title}</span>
            <span>{zhCN.conversation.commands.keyboardHint}</span>
          </div>
          <div
            ref={listRef}
            id={_id}
            role="listbox"
            aria-label={_copy.title}
            aria-busy={_pending}
            class="max-h-[min(16rem,50vh)] overflow-y-auto"
          >
            {_pending && (
              <p role="status" class="px-2 py-3 text-xs text-muted-foreground">
                {_copy.loading}
              </p>
            )}
            {_error !== null && (
              <p role="alert" class="px-2 py-3 text-xs text-destructive">
                {_error}
                {_onRetry !== undefined && (
                  <button
                    type="button"
                    class="ml-2 underline"
                    onClick={_onRetry}
                  >
                    {zhCN.mapConversation.retry}
                  </button>
                )}
              </p>
            )}
            {!_pending && _error === null && _items.length === 0 && (
              <p class="px-2 py-3 text-xs text-muted-foreground">
                {_copy.empty}
              </p>
            )}
            {_items.map((item, index) => (
              <div
                key={item.id}
                id={`${_id}-${item.id}`}
                role="option"
                aria-selected={index === _activeIndex}
                aria-disabled={item.unavailableReason !== null}
                class="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-xs aria-selected:bg-muted aria-disabled:cursor-default aria-disabled:text-muted-foreground"
                onMouseenter={() => _onActiveIndexChange(index)}
                onMousedown={(event) => event.preventDefault()}
                onClick={() => {
                  if (item.unavailableReason === null) _onSelect(index);
                }}
              >
                <span class="w-32 shrink-0 break-words font-medium">
                  {item.label}
                </span>
                <span class="min-w-0 flex-1 break-words">
                  {item.unavailableReason ?? item.description}
                  {item.detail !== null && (
                    <span class="mt-0.5 block text-[11px] text-muted-foreground">
                      {item.detail}
                    </span>
                  )}
                  {item.inputHint !== null && (
                    <span class="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                      {item.inputHint}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    };
  },
  {
    name: "ComposerSuggestionMenu",
    inheritAttrs: false,
    props: [
      "id",
      "items",
      "copy",
      "activeIndex",
      "pending",
      "error",
      "onActiveIndexChange",
      "onSelect",
      "onRetry",
    ],
  },
);
