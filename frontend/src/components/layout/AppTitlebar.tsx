import { Ellipsis, Share } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.shell;

function SidebarToggleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="6" y="10" width="36" height="28" rx="5" />
      <line x1="18" y1="10" x2="18" y2="38" />
    </svg>
  );
}

interface AppTitlebarProps {
  readonly onToggleSidebar: () => void;
  readonly sidebarCollapsed: boolean;
  readonly sidebarWidth: number;
  readonly toggleLabel: string;
}

export function AppTitlebar({
  onToggleSidebar,
  sidebarCollapsed,
  sidebarWidth,
  toggleLabel
}: AppTitlebarProps) {
  return (
    <header className="relative z-50 flex h-[45px] shrink-0 items-center border-b border-border bg-background [-webkit-app-region:drag]">
      <div className="ml-[76px] flex items-center [-webkit-app-region:no-drag]">
        <Tooltip label={toggleLabel}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 border-0 bg-transparent text-secondary-foreground shadow-none hover:bg-muted hover:text-foreground"
            onClick={onToggleSidebar}
            aria-label={toggleLabel}
            aria-expanded={!sidebarCollapsed}
            aria-controls="task-sidebar"
          >
            <SidebarToggleIcon />
          </Button>
        </Tooltip>
      </div>
      <div
        id="session-titlebar-title-slot"
        className="pointer-events-none absolute inset-y-0 flex max-w-[38%] items-center transition-[left] duration-200 ease-out"
        style={{ left: sidebarCollapsed ? 124 : sidebarWidth + 20 }}
      />
      <div
        id="session-titlebar-mode-slot"
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-200 ease-out [-webkit-app-region:no-drag]"
        style={{ left: `calc((100% + ${sidebarCollapsed ? 56 : sidebarWidth}px) / 2)` }}
      />
      <div className="ml-auto mr-4 flex shrink-0 items-center gap-5 text-muted-foreground [-webkit-app-region:no-drag] max-[640px]:hidden">
        <span
          className="flex size-8 items-center justify-center"
          role="img"
          aria-label={content.more}
        >
          <Ellipsis size={19} strokeWidth={2} aria-hidden="true" />
        </span>
        <span
          className="flex h-8 items-center gap-2 text-sm font-medium"
          role="img"
          aria-label={content.share}
        >
          <Share size={18} strokeWidth={1.8} aria-hidden="true" />
          <span aria-hidden="true">{content.share}</span>
        </span>
      </div>
    </header>
  );
}
