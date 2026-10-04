import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { useSessionEvents } from "@/features/events/SessionEventContext";
import { zhCN } from "@/locales/zh-CN";
import { selectCurrentTodos } from "./todos";
import { TodoItems } from "./TodoItems";

const copy = zhCN.conversation.planBar;

export function ConversationPlanBar({
  runId,
  processing,
}: {
  readonly runId: string | null;
  readonly processing: boolean;
}) {
  const { events } = useSessionEvents();
  const plan = selectCurrentTodos(events);
  const [expanded, setExpanded] = useState(true);
  if (!processing || plan === null || plan.runId !== runId || plan.todos.length === 0) return null;
  const completed = plan.todos.filter((item) => item.status === "completed").length;
  return (
    <div className="shrink-0 px-3" data-composer-zone>
      <div className="chat-surface-fluid border-t border-border py-1.5" data-testid="conversation-plan-bar">
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2 px-2 text-left text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-expanded={expanded}
          aria-label={expanded ? copy.collapse : copy.expand}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          <span className="size-1.5 rounded-full bg-muted-foreground" aria-hidden="true" />
          <span className="text-[13px]">{copy.title}</span>
          <span className="text-xs">{copy.progress(completed, plan.todos.length)}</span>
        </button>
        {expanded && (
          <div className="max-h-[min(22vh,180px)] overflow-y-auto overscroll-contain pt-1.5 pr-2 pl-[30px]">
            <TodoItems items={plan.todos} />
          </div>
        )}
      </div>
    </div>
  );
}
