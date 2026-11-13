import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { computed, defineComponent, type VNodeChild } from "vue";
interface SidebarItemProps {
  readonly collapsed: boolean;
  readonly disabled?: boolean;
  readonly icon: VNodeChild;
  readonly label: string;
  readonly pending?: boolean;
  readonly onClick?: () => void;
}
export const SidebarItem = defineComponent(
  (componentProps: SidebarItemProps, { slots: _slots }) => {
    const collapsed = computed(() => componentProps.collapsed),
      disabled = computed(() =>
        componentProps.disabled === undefined ? false : componentProps.disabled,
      ),
      icon = computed(() => componentProps.icon),
      label = computed(() => componentProps.label),
      pending = computed(() =>
        componentProps.pending === undefined ? false : componentProps.pending,
      ),
      onClick = computed(() => componentProps.onClick);
    return () => {
      const _label = label.value,
        _collapsed = collapsed.value,
        _disabled = disabled.value,
        _onClick = onClick.value,
        _pending = pending.value,
        _icon = icon.value;
      return (
        <Tooltip label={_label} visible={_collapsed}>
          <button
            type="button"
            class={cn(
              "flex h-[32px] w-full items-center rounded-md border-0 bg-transparent text-[13px] font-normal text-secondary-foreground outline-none transition-colors hover:bg-accent active:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 aria-disabled:cursor-default aria-disabled:hover:bg-transparent aria-disabled:active:bg-transparent disabled:pointer-events-none",
              _collapsed ? "justify-center" : "gap-1.5 px-1",
            )}
            onClick={_disabled ? undefined : _onClick}
            disabled={_pending}
            aria-disabled={_disabled || undefined}
            aria-label={_collapsed ? _label : undefined}
            aria-busy={_pending || undefined}
          >
            <span
              class="flex size-[22px] shrink-0 items-center justify-center text-secondary-foreground"
              aria-hidden="true"
            >
              {_icon}
            </span>
            {_collapsed ? null : (
              <span class="whitespace-nowrap">{_label}</span>
            )}
          </button>
        </Tooltip>
      );
    };
  },
  {
    name: "SidebarItem",
    inheritAttrs: false,
    props: ["collapsed", "disabled", "icon", "label", "pending", "onClick"],
  },
);
