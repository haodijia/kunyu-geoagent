import { CheckCircle2, Circle } from "lucide-react";
import type { TodoItem } from "./todos";

export function TodoItems({ items }: { readonly items: readonly TodoItem[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {items.map((item) => (
        <li key={item.content} className="flex items-start gap-2 text-[13px] leading-5 text-secondary-foreground">
          {item.status === "completed" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
          )}
          <span className={item.status === "in_progress" ? "text-foreground [overflow-wrap:anywhere]" : "[overflow-wrap:anywhere]"}>
            {item.content}
          </span>
        </li>
      ))}
    </ul>
  );
}
