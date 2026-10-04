import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CornerDownRight, Delete, Drag, Edit, SendOne } from "@icon-park/react";

import { Button } from "@/components/ui/button";
import { zhCN } from "@/locales/zh-CN";
import type { SessionMessage } from "../api";

const content = zhCN.conversation.queue;

interface QueuedMessageRowProps {
  readonly message: SessionMessage;
  readonly disabled: boolean;
  readonly editDisabled: boolean;
  readonly narrow: boolean;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
  readonly onSend: () => void;
}

export function QueuedMessageRow({ message, disabled, editDisabled, narrow, onEdit, onRemove, onSend }: QueuedMessageRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: message.id, disabled });
  const preview = [message.content.replace(/\s+/g, " ").trim(), ...message.attachments.map((ref) => ref.name)].filter(Boolean).join(" · ");
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.58 : 1, zIndex: isDragging ? 2 : undefined, position: "relative" }}>
      <div
        {...(narrow ? { ...attributes, ...listeners } : {})}
        ref={narrow ? setActivatorNodeRef : undefined}
        className="queue-message-row group flex items-center justify-between gap-1.5 rounded-[10px] px-2 py-[5px] transition-[background-color,opacity] duration-180"
        data-command-id={message.id} data-sortable={disabled ? "disabled" : "enabled"}
        aria-grabbed={isDragging} aria-label={preview}
        style={{ touchAction: narrow && !disabled ? "none" : undefined }}
      >
        <div className="relative flex min-w-0 flex-1 items-center gap-1.5 ps-2">
          <div className="relative flex w-[18px] shrink-0 items-center gap-[5px]">
            {!narrow && (
              <button
                {...attributes} {...listeners} ref={setActivatorNodeRef} type="button" disabled={disabled}
                aria-label={content.reorder} data-drag-handle={disabled ? "disabled" : "enabled"}
                className={`absolute top-1/2 -left-[15px] inline-flex h-4 w-3 -translate-y-1/2 touch-none items-center justify-center border-0 bg-transparent p-0 text-muted-foreground outline-none transition-opacity ${isDragging ? "cursor-grabbing opacity-100" : "cursor-grab opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
              ><Drag theme="outline" size={12} strokeWidth={2.5} /></button>
            )}
            <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground"><CornerDownRight theme="outline" size={12} strokeWidth={2.3} /></span>
          </div>
          <p className="min-w-0 flex-1 truncate text-[11px] leading-4 text-[var(--color-text-2)]" title={message.content}>{preview}</p>
        </div>
        <div className="flex h-6 shrink-0 items-center gap-0.5 overflow-hidden">
          <Button type="button" variant="ghost" size="icon" className="size-6 rounded-full text-[var(--mu-primary-fill)] opacity-72 hover:opacity-100" disabled={disabled} aria-label={content.sendNow} title={content.sendNow} onClick={onSend}><SendOne theme="outline" size={14} strokeWidth={2.5} /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-6 rounded-full text-muted-foreground opacity-72 hover:opacity-100" disabled={disabled || editDisabled} aria-label={content.edit} title={editDisabled ? content.draftOccupied : content.edit} onClick={onEdit}><Edit theme="outline" size={14} strokeWidth={2.5} /></Button>
          <Button type="button" variant="ghost" size="icon" className="size-6 rounded-full text-destructive opacity-72 hover:opacity-100" disabled={disabled} aria-label={content.remove} title={content.remove} onClick={onRemove}><Delete theme="outline" size={14} strokeWidth={2.5} /></Button>
        </div>
      </div>
    </div>
  );
}
