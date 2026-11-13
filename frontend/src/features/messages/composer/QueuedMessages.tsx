import { ApiError } from "@/api/client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import {
  agentQueryKeys,
  clearAgentQueue,
  discardAgentInput,
  sendQueuedAgentInput,
  takeQueuedAgentDraft,
  updateAgentQueue,
} from "@/features/agent/api";
import {
  inboxQueueMode,
  pendingInboxMessages,
} from "@/features/conversation/inbox";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { messageQueryKeys, type SessionMessage } from "@/features/messages/api";
import { DraftBoxIcon } from "@/features/messages/composer/DraftBoxIcon";
import { QueuedMessageRow } from "@/features/messages/composer/QueuedMessageRow";
import { useQueueInteraction } from "@/features/messages/composer/useQueueInteraction";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { MoreOne, SortTwo } from "@icon-park/vue-next";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import {
  computed,
  defineComponent,
  reactive,
  shallowRef,
  shallowRef as sortingRef,
  toRefs,
  watch,
} from "vue";
import { useDraggable } from "vue-draggable-plus";
import { toast } from "vue-sonner";
const content = zhCN.conversation.queue;
type QueueAction =
  | {
      readonly kind: "remove" | "edit" | "send";
      readonly message: SessionMessage;
    }
  | {
      readonly kind: "clear";
    }
  | {
      readonly kind: "mode";
      readonly mode: "auto" | "manual";
    }
  | {
      readonly kind: "reorder";
      readonly ids: readonly string[];
    };
export const QueuedMessages = defineComponent(
  (
    componentProps: {
      readonly onDraftLockChange: (locked: boolean) => void;
    },
    { slots: _slots },
  ) => {
    const onDraftLockChange = computed(() => componentProps.onDraftLockChange);
    const session = useSessionWorkspace();
    const { records } = toRefs(useSessionEvents());
    const {
      messagesQuery,
      draft,
      quote,
      attachmentState,
      restoreDraft,
      requestFrozen,
      mutation: submission,
    } = toRefs(useSessionMessages());
    const queryClient = useQueryClient();
    const containerRef = shallowRef<HTMLDivElement | null>(null);
    const narrow = shallowRef(false),
      setNarrow = refSetter(narrow);
    const dragging = shallowRef(false),
      setDragging = refSetter(dragging);
    const clearOpen = shallowRef(false),
      setClearOpen = refSetter(clearOpen);
    const interaction = useQueueInteraction(() => session.id);
    const pending = computed(() =>
      pendingInboxMessages(records.value, "next-turn"),
    );
    const mode = computed(() => inboxQueueMode(records.value));
    const messagesById = computed(
      () =>
        new Map(
          (messagesQuery.value.data ?? []).map((message) => [
            message.id,
            message,
          ]),
        ),
    );
    const messages = computed(() =>
      [...pending.value].flatMap((id) => {
        const message = messagesById.value.get(id);
        return message === undefined ? [] : [message];
      }),
    );
    const mutation = reactive(
      useMutation({
        mutationFn: async (action: QueueAction) => {
          switch (action.kind) {
            case "mode":
              await updateAgentQueue(session.id, {
                mode: action.mode,
              });
              return null;
            case "reorder":
              await updateAgentQueue(session.id, {
                message_ids: action.ids,
              });
              return null;
            case "send":
              await sendQueuedAgentInput(session.id, action.message.id);
              return null;
            case "clear":
              await clearAgentQueue(session.id);
              return null;
            case "edit":
              return takeQueuedAgentDraft(session.id, action.message.id);
            case "remove":
              await discardAgentInput(session.id, action.message.id);
              return null;
          }
        },
        onSuccess: (queued) => {
          if (queued !== null) {
            onDraftLockChange.value(false);
            restoreDraft.value(queued);
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLTextAreaElement>(".composer-panel textarea")
                ?.focus(),
            );
          }
          setClearOpen(false);
        },
        onError: (error) => {
          console.error("[inbox] Failed to change queued input.", {
            sessionId: session.id,
            error,
          });
          toast.error(
            error instanceof ApiError && error.status === 409
              ? content.queueChanged
              : content.failed,
          );
        },
        onSettled: () =>
          Promise.all([
            queryClient.invalidateQueries({
              queryKey: messageQueryKeys.session(session.id),
            }),
            queryClient.invalidateQueries({
              queryKey: agentQueryKeys.session(session.id),
            }),
          ]),
      }),
    );
    const disabled = computed(
      () =>
        mutation.isPending ||
        submission.value.isPending ||
        interaction.finishing,
    );
    const editing = computed(
      () => mutation.isPending && mutation.variables.kind === "edit",
    );
    watchMounted([() => editing.value, () => onDraftLockChange.value], () => {
      onDraftLockChange.value(editing.value);
      return () => onDraftLockChange.value(false);
    });
    watchMounted([() => messages.value.length], () => {
      const container = containerRef.value;
      if (container === null) return;
      const observer = new ResizeObserver(([entry]) => {
        if (entry !== undefined) setNarrow(entry.contentRect.width < 640);
      });
      observer.observe(container);
      return () => observer.disconnect();
    });
    const sortItems = sortingRef([...messages.value]);
    watch(messages, (value) => {
      sortItems.value = [...value];
    });
    const sorting = useDraggable(containerRef, sortItems, {
      immediate: false,
      handle: "[data-sort-handle]",
      animation: 180,
      direction: "vertical",
      disabled: disabled.value,
      delay: 160,
      delayOnTouchOnly: true,
      onStart: () => {
        interaction.begin(messages.value.map((item) => item.id));
        setDragging(true);
      },
      onEnd: () => {
        setDragging(false);
        void interaction.finish(async () => {
          try {
            await mutation.mutateAsync({
              kind: "reorder",
              ids: sortItems.value.map((item) => item.id),
            });
          } catch (error) {
            console.error("[queue] Reorder failed.", error);
          }
        });
      },
    });
    watch(disabled, (value) => sorting.option("disabled", value));
    watch(
      containerRef,
      (element) => {
        sorting.destroy();
        if (element !== null) sorting.start(element);
      },
      { flush: "post" },
    );
    function moveByKey(event: KeyboardEvent) {
      if (
        !(event.target instanceof HTMLElement) ||
        !event.target.closest("[data-sort-handle]")
      )
        return;
      if (disabled.value || !["ArrowUp", "ArrowDown"].includes(event.key))
        return;
      const row = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-sort-id]",
      );
      const from = sortItems.value.findIndex(
        (item) => item.id === row?.dataset.sortId,
      );
      const to = from + (event.key === "ArrowUp" ? -1 : 1);
      if (from < 0 || to < 0 || to >= sortItems.value.length) return;
      event.preventDefault();
      interaction.begin(messages.value.map((item) => item.id));
      const next = [...sortItems.value];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      sortItems.value = next;
      void interaction.finish(async () => {
        await mutation.mutateAsync({
          kind: "reorder",
          ids: next.map((item) => item.id),
        });
      });
    }
    return () => {
      const _messages = messages.value,
        _mode = mode.value,
        _disabled = disabled.value,
        _onDraftLockChange = onDraftLockChange.value;
      if (_messages.length === 0) return null;
      return (
        <div class="shrink-0 px-3 pt-2">
          <section
            aria-label={content.title}
            class="chat-surface-fluid queue-panel relative -mb-3 overflow-hidden rounded-t-[18px] border pb-3"
          >
            <div class="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
              <div class="flex min-w-0 items-center gap-1.5 leading-none">
                <span class="inline-flex items-center gap-[5px] text-xs font-semibold whitespace-nowrap text-[var(--color-text-2)]">
                  <DraftBoxIcon size={15} />
                  <span class={narrow.value ? "sr-only" : undefined}>
                    {content.title}
                  </span>
                </span>
                <span class="inline-flex h-4 items-center justify-center rounded-full bg-[var(--color-fill-3)] px-1.5 text-[10px] leading-none font-semibold text-[var(--color-text-2)]">
                  {_messages.length}
                </span>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <Tooltip side="top" label={content.help}>
                  <Button
                    type="button"
                    variant="ghost"
                    class={`h-6 rounded-full px-[9px] text-[11px] font-semibold ${_mode === "auto" ? "bg-muted text-[var(--mu-primary-fill)]" : "bg-[var(--color-fill-2)] text-[var(--color-text-2)]"}`}
                    disabled={_disabled || dragging.value}
                    aria-label={content.toggleMode}
                    onClick={() =>
                      mutation.mutate({
                        kind: "mode",
                        mode: _mode === "auto" ? "manual" : "auto",
                      })
                    }
                  >
                    {_mode === "auto" ? content.auto : content.manual}
                    <SortTwo
                      theme="outline"
                      size={12}
                      strokeWidth={3}
                      class="opacity-70"
                    />
                  </Button>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      class="size-[22px] rounded-full text-muted-foreground opacity-72 hover:opacity-100"
                      disabled={_disabled || dragging.value}
                      aria-label={content.more}
                    >
                      <MoreOne theme="outline" size={15} strokeWidth={2.5} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      class="text-destructive focus:text-destructive"
                      onSelect={() => setClearOpen(true)}
                    >
                      {content.clear}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <>
              <>
                <div
                  ref={containerRef}
                  onKeydown={moveByKey}
                  data-command-queue-list="true"
                  data-drag-axis="vertical"
                  data-drag-bounds="queue"
                  class={`flex flex-col gap-1 overflow-y-auto overscroll-contain p-1.5 ${narrow.value ? "max-h-[min(48vh,320px)]" : "max-h-[min(36vh,320px)]"}`}
                >
                  {sortItems.value.map((message) => (
                    <QueuedMessageRow
                      key={message.id}
                      message={message}
                      disabled={_disabled}
                      editDisabled={
                        quote.value !== null ||
                        draft.value.trim().length > 0 ||
                        attachmentState.value.attachments.length > 0 ||
                        attachmentState.value.pending ||
                        attachmentState.value.retryAvailable ||
                        requestFrozen.value
                      }
                      narrow={narrow.value}
                      onEdit={() => {
                        _onDraftLockChange(true);
                        mutation.mutate({
                          kind: "edit",
                          message,
                        });
                      }}
                      onRemove={() =>
                        mutation.mutate({
                          kind: "remove",
                          message,
                        })
                      }
                      onSend={() =>
                        mutation.mutate({
                          kind: "send",
                          message,
                        })
                      }
                    />
                  ))}
                </div>
              </>
            </>
          </section>
          <AlertDialog open={clearOpen.value} onUpdate:open={setClearOpen}>
            <AlertDialogContent>
              <AlertDialogTitle>{content.clearTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {content.clearDescription}
              </AlertDialogDescription>
              <div class="flex justify-end gap-2">
                <AlertDialogCancel asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={mutation.isPending}
                  >
                    {content.cancel}
                  </Button>
                </AlertDialogCancel>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      kind: "clear",
                    })
                  }
                >
                  {content.clear}
                </Button>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      );
    };
  },
  {
    name: "QueuedMessages",
    inheritAttrs: false,
    props: ["onDraftLockChange"],
  },
);
