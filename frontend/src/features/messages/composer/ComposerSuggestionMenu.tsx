import { useEffect, useRef } from "react";

import { zhCN } from "@/locales/zh-CN";

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
  readonly copy: { readonly title: string; readonly loading: string; readonly empty: string };
  readonly activeIndex: number;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onSelect: (index: number) => void;
  readonly onRetry?: () => void;
}

export function ComposerSuggestionMenu({
  id, items, copy, activeIndex, pending, error, onActiveIndexChange, onSelect, onRetry,
}: ComposerSuggestionMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="absolute inset-x-0 bottom-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-md">
      <div className="flex items-center justify-between px-2 py-1.5 text-[11px] text-muted-foreground">
        <span>{copy.title}</span>
        <span>{zhCN.conversation.commands.keyboardHint}</span>
      </div>
      <div ref={listRef} id={id} role="listbox" aria-label={copy.title} aria-busy={pending} className="max-h-[min(16rem,50vh)] overflow-y-auto">
        {pending && <p role="status" className="px-2 py-3 text-xs text-muted-foreground">{copy.loading}</p>}
        {error !== null && <p role="alert" className="px-2 py-3 text-xs text-destructive">{error}{onRetry !== undefined && <button type="button" className="ml-2 underline" onClick={onRetry}>{zhCN.mapConversation.retry}</button>}</p>}
        {!pending && error === null && items.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">{copy.empty}</p>}
        {items.map((item, index) => (
          <div
            key={item.id}
            id={`${id}-${item.id}`}
            role="option"
            aria-selected={index === activeIndex}
            aria-disabled={item.unavailableReason !== null}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-xs aria-selected:bg-muted aria-disabled:cursor-default aria-disabled:text-muted-foreground"
            onMouseEnter={() => onActiveIndexChange(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => { if (item.unavailableReason === null) onSelect(index); }}
          >
            <span className="w-32 shrink-0 break-words font-medium">{item.label}</span>
            <span className="min-w-0 flex-1 break-words">{item.unavailableReason ?? item.description}{item.detail !== null && <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.detail}</span>}{item.inputHint !== null && <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{item.inputHint}</span>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
