import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { computed, defineComponent } from "vue";
const SidebarToggleIcon = defineComponent(
  (_props, { slots: _slots }) => {
    return () => {
      return (
        <svg
          width="18"
          height="18"
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="6" y="10" width="36" height="28" rx="5" />
          <line x1="18" y1="10" x2="18" y2="38" />
        </svg>
      );
    };
  },
  {
    name: "SidebarToggleIcon",
    inheritAttrs: false,
    props: [],
  },
);
interface AppTitlebarProps {
  readonly onToggleSidebar: () => void;
  readonly sidebarCollapsed: boolean;
  readonly sidebarWidth: number;
  readonly toggleLabel: string;
}
export const AppTitlebar = defineComponent(
  (componentProps: AppTitlebarProps, { slots: _slots }) => {
    const onToggleSidebar = computed(() => componentProps.onToggleSidebar),
      sidebarCollapsed = computed(() => componentProps.sidebarCollapsed),
      sidebarWidth = computed(() => componentProps.sidebarWidth),
      toggleLabel = computed(() => componentProps.toggleLabel);
    return () => {
      const _toggleLabel = toggleLabel.value,
        _onToggleSidebar = onToggleSidebar.value,
        _sidebarCollapsed = sidebarCollapsed.value,
        _sidebarWidth = sidebarWidth.value;
      return (
        <header class="relative z-50 flex h-[45px] shrink-0 items-center border-b border-border bg-background">
          <div class="ml-2 flex items-center">
            <Tooltip label={_toggleLabel}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                class="size-9 border-0 bg-transparent text-secondary-foreground shadow-none hover:bg-muted hover:text-foreground"
                onClick={_onToggleSidebar}
                aria-label={_toggleLabel}
                aria-expanded={!_sidebarCollapsed}
                aria-controls="task-sidebar"
              >
                <SidebarToggleIcon />
              </Button>
            </Tooltip>
          </div>
          <div
            id="session-titlebar-title-slot"
            class="pointer-events-none absolute inset-y-0 flex max-w-[38%] items-center transition-[left] duration-200 ease-out"
            style={{
              left: `${_sidebarCollapsed ? 56 : _sidebarWidth + 20}px`,
            }}
          />
          <div
            id="session-titlebar-mode-slot"
            class="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-200 ease-out"
            style={{
              left: `calc((100% + ${_sidebarCollapsed ? 56 : _sidebarWidth}px) / 2)`,
            }}
          />
          <div
            id="session-titlebar-actions-slot"
            class="ml-auto mr-2 flex shrink-0 items-center text-muted-foreground"
          />
        </header>
      );
    };
  },
  {
    name: "AppTitlebar",
    inheritAttrs: false,
    props: [
      "onToggleSidebar",
      "sidebarCollapsed",
      "sidebarWidth",
      "toggleLabel",
    ],
  },
);
