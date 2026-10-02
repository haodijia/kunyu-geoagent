import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type Modifier } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { MoreOne, SortTwo } from "@icon-park/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/api/client";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { agentQueryKeys, clearAgentQueue, discardAgentInput, sendQueuedAgentInput, updateAgentQueue } from "@/features/agent/api";
import { inboxQueueMode, pendingInboxMessages } from "@/features/conversation/inbox";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { zhCN } from "@/locales/zh-CN";
import { messageQueryKeys, type SessionMessage } from "./api";
import { DraftBoxIcon } from "./composer/DraftBoxIcon";
import { QueuedMessageRow } from "./composer/QueuedMessageRow";
import { useSessionMessages } from "./SessionMessagesContext";

const content = zhCN.conversation.queue;
type QueueAction =
  | { readonly kind: "remove" | "edit" | "send"; readonly message: SessionMessage }
  | { readonly kind: "clear" }
  | { readonly kind: "mode"; readonly mode: "auto" | "manual" }
  | { readonly kind: "reorder"; readonly ids: readonly string[] };

export function QueuedMessages({ onDraftLockChange }: { readonly onDraftLockChange: (locked: boolean) => void }) {
  const session = useSessionWorkspace();
  const { records } = useSessionEvents();
  const { messagesQuery, draft, changeDraft, requestFrozen, mutation: submission } = useSessionMessages();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const pending = useMemo(() => pendingInboxMessages(records, "next-turn"), [records]);
  const mode = inboxQueueMode(records);
  const messagesById = new Map((messagesQuery.data ?? []).map((message) => [message.id, message]));
  const messages = [...pending].flatMap((id) => {
    const message = messagesById.get(id);
    return message === undefined ? [] : [message];
  });
  const mutation = useMutation({
    mutationFn: async (action: QueueAction) => {
      switch (action.kind) {
        case "mode": await updateAgentQueue(session.id, { mode: action.mode }); return null;
        case "reorder": await updateAgentQueue(session.id, { message_ids: action.ids }); return null;
        case "send": await sendQueuedAgentInput(session.id, action.message.id); return null;
        case "clear": await clearAgentQueue(session.id); return null;
        case "remove": case "edit":
          await discardAgentInput(session.id, action.message.id);
          return action.kind === "edit" ? action.message.content : null;
      }
    },
    onSuccess: (text) => {
      if (text !== null) {
        onDraftLockChange(false);
        changeDraft(text);
        requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".composer-panel textarea")?.focus());
      }
      setClearOpen(false);
    },
    onError: (error) => {
      console.error("[inbox] Failed to change queued input.", { sessionId: session.id, error });
      toast.error(error instanceof ApiError && error.status === 409 ? content.queueChanged : content.failed);
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: messageQueryKeys.session(session.id) }),
      queryClient.invalidateQueries({ queryKey: agentQueryKeys.session(session.id) }),
    ]),
  });
  const disabled = mutation.isPending || submission.isPending;
  const editing = mutation.isPending && mutation.variables.kind === "edit";
  useEffect(() => {
    onDraftLockChange(editing);
    return () => onDraftLockChange(false);
  }, [editing, onDraftLockChange]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: narrow ? { delay: 200, tolerance: 6 } : { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const modifiers = useMemo<Modifier[]>(() => [({ draggingNodeRect, transform }) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (bounds === undefined || draggingNodeRect === null) return { ...transform, x: 0 };
    return { ...transform, x: 0, y: Math.min(Math.max(transform.y, bounds.top - draggingNodeRect.top), bounds.bottom - draggingNodeRect.bottom) };
  }], []);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setNarrow(entry.contentRect.width < 640);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [messages.length]);

  function finishDrag({ active, over }: DragEndEvent) {
    setDragging(false);
    if (document.activeElement instanceof HTMLElement && document.activeElement.dataset.dragHandle !== undefined) document.activeElement.blur();
    if (over === null || active.id === over.id) return;
    const ids = messages.map((message) => message.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    mutation.mutate({ kind: "reorder", ids: arrayMove(ids, from, to) });
  }

  if (messages.length === 0) return null;
  return (
    <div className="shrink-0 px-3 pt-2">
      <section aria-label={content.title} className="chat-surface-fluid queue-panel relative -mb-3 overflow-hidden rounded-t-[18px] border pb-3">
        <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
          <div className="flex min-w-0 items-center gap-1.5 leading-none">
            <span className="inline-flex items-center gap-[5px] text-xs font-semibold whitespace-nowrap text-[var(--color-text-2)]"><DraftBoxIcon size={15} /><span className={narrow ? "sr-only" : undefined}>{content.title}</span></span>
            <span className="inline-flex h-4 items-center justify-center rounded-full bg-[var(--color-fill-3)] px-1.5 text-[10px] leading-none font-semibold text-[var(--color-text-2)]">{messages.length}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip side="top" label={content.help}>
              <Button type="button" variant="ghost" className={`h-6 rounded-full px-[9px] text-[11px] font-semibold ${mode === "auto" ? "bg-[var(--mu-violet-1)] text-[var(--mu-primary-fill)]" : "bg-[var(--color-fill-2)] text-[var(--color-text-2)]"}`} disabled={disabled || dragging} aria-label={content.toggleMode} onClick={() => mutation.mutate({ kind: "mode", mode: mode === "auto" ? "manual" : "auto" })}>
                {mode === "auto" ? content.auto : content.manual}<SortTwo theme="outline" size={12} strokeWidth={3} className="opacity-70" />
              </Button>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-[22px] rounded-full text-muted-foreground opacity-72 hover:opacity-100" disabled={disabled || dragging} aria-label={content.more}><MoreOne theme="outline" size={15} strokeWidth={2.5} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setClearOpen(true)}>{content.clear}</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={modifiers} onDragStart={() => setDragging(true)} onDragEnd={finishDrag} onDragCancel={() => setDragging(false)} accessibility={{
          screenReaderInstructions: { draggable: content.dragInstructions },
          announcements: {
            onDragStart: () => content.dragStarted,
            onDragOver: ({ over }) => over === null ? undefined : content.dragMoved(messages.findIndex((message) => message.id === over.id) + 1),
            onDragEnd: () => content.dragFinished,
            onDragCancel: () => content.dragCancelled,
          },
        }}>
          <SortableContext items={messages.map((message) => message.id)} strategy={verticalListSortingStrategy}>
            <div ref={containerRef} data-command-queue-list="true" data-drag-axis="vertical" data-drag-bounds="queue" className={`flex flex-col gap-1 overflow-y-auto overscroll-contain p-1.5 ${narrow ? "max-h-[min(48vh,320px)]" : "max-h-[min(36vh,320px)]"}`}>
              {messages.map((message) => <QueuedMessageRow key={message.id} message={message} disabled={disabled} editDisabled={draft.trim().length > 0 || requestFrozen} narrow={narrow}
                onEdit={() => mutation.mutate({ kind: "edit", message })} onRemove={() => mutation.mutate({ kind: "remove", message })} onSend={() => mutation.mutate({ kind: "send", message })} />)}
            </div>
          </SortableContext>
        </DndContext>
      </section>
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>{content.clearTitle}</AlertDialogTitle><AlertDialogDescription>{content.clearDescription}</AlertDialogDescription>
          <div className="flex justify-end gap-2"><AlertDialogCancel asChild><Button type="button" variant="outline" disabled={mutation.isPending}>{content.cancel}</Button></AlertDialogCancel><Button type="button" variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate({ kind: "clear" })}>{content.clear}</Button></div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
