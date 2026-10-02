import { useEffect, useRef } from "react";

import { zhCN } from "@/locales/zh-CN";
import type { ComposerCommandDescriptor } from "./commands";

interface ComposerCommandMenuProps {
  readonly id: string;
  readonly commands: readonly ComposerCommandDescriptor[];
  readonly activeIndex: number;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onSelect: (command: ComposerCommandDescriptor) => void;
}

export function ComposerCommandMenu({
  id, commands, activeIndex, pending, error, onActiveIndexChange, onSelect,
}: ComposerCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const content = zhCN.conversation.commands;

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="composer-command-menu absolute inset-x-0 bottom-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-md">
      <div className="flex items-center justify-between px-2 py-1.5 text-[11px] text-muted-foreground">
        <span>{content.title}</span>
        <span>{content.keyboardHint}</span>
      </div>
      <div ref={listRef} id={id} role="listbox" aria-label={content.title} className="max-h-[min(16rem,50vh)] overflow-y-auto">
        {pending && <p role="status" className="px-2 py-3 text-xs text-muted-foreground">{content.loading}</p>}
        {error !== null && <p role="alert" className="px-2 py-3 text-xs text-destructive">{error}</p>}
        {commands.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">{content.empty}</p>}
        {commands.map((command, index) => (
          <div
            key={command.name}
            id={`${id}-${command.name}`}
            role="option"
            aria-selected={index === activeIndex}
            aria-disabled={command.unavailableReason !== null}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-xs aria-selected:bg-muted aria-disabled:cursor-default aria-disabled:text-muted-foreground"
            onMouseEnter={() => onActiveIndexChange(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(command)}
          >
            <span className="w-24 shrink-0 break-words font-medium">/{command.name}</span>
            <span className="min-w-0 flex-1">{command.unavailableReason ?? command.description}{command.input_hint !== null && <span className="mt-0.5 block break-words font-mono text-[10px] text-muted-foreground">{command.input_hint}</span>}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
