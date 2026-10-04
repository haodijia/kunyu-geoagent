import { ClipboardList, CircleX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { zhCN } from "@/locales/zh-CN";

export function ComposerPlanChip({ locked, onExit }: {
  readonly locked: boolean;
  readonly onExit: () => void;
}) {
  const { plan, status } = useSessionEvents();
  if (plan === null || !(plan.pending ?? plan.active)) return null;
  const copy = zhCN.conversation.planMode;
  return <Button type="button" variant="ghost" size="sm"
    className="group h-7 shrink-0 gap-1 rounded-full bg-primary/20 px-2 text-[12px] font-medium text-foreground hover:bg-primary/30 hover:text-foreground"
    data-testid="composer-plan-chip" data-pending={plan.pending !== null}
    aria-label={copy.exit} title={plan.pending === null ? copy.exit : copy.pending}
    disabled={locked || status !== "connected"} onClick={onExit}>
    <span className="relative size-3.5">
      <ClipboardList aria-hidden="true" className="absolute size-3.5 group-enabled:group-hover:hidden group-enabled:group-focus-visible:hidden" />
      <CircleX aria-hidden="true" className="absolute hidden size-3.5 group-enabled:group-hover:block group-enabled:group-focus-visible:block" />
    </span>
    {copy.label}
  </Button>;
}
