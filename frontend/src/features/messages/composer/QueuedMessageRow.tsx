import { Button } from "@/components/ui/button";
import type { SessionMessage } from "@/features/messages/api";
import { zhCN } from "@/locales/zh-CN";
import {
  CornerDownRight,
  Delete,
  Drag,
  Edit,
  SendOne,
} from "@icon-park/vue-next";
import { computed, defineComponent } from "vue";
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
export const QueuedMessageRow = defineComponent(
  (componentProps: QueuedMessageRowProps, { slots: _slots }) => {
    const message = computed(() => componentProps.message),
      disabled = computed(() => componentProps.disabled),
      editDisabled = computed(() => componentProps.editDisabled),
      narrow = computed(() => componentProps.narrow),
      onEdit = computed(() => componentProps.onEdit),
      onRemove = computed(() => componentProps.onRemove),
      onSend = computed(() => componentProps.onSend);
    const preview = computed(() =>
      [
        message.value.content.replace(/\s+/g, " ").trim(),
        ...message.value.attachments.map((ref) => ref.name),
      ]
        .filter(Boolean)
        .join(" · "),
    );
    return () => {
      const _message = message.value,
        _disabled = disabled.value,
        _narrow = narrow.value,
        _preview = preview.value,
        _onSend = onSend.value,
        _editDisabled = editDisabled.value,
        _onEdit = onEdit.value,
        _onRemove = onRemove.value;
      return (
        <div data-sort-id={_message.id} style={{ position: "relative" }}>
          <div
            class="queue-message-row group flex items-center justify-between gap-1.5 rounded-[10px] px-2 py-[5px] transition-[background-color,opacity] duration-180"
            data-command-id={_message.id}
            data-sortable={_disabled ? "disabled" : "enabled"}
            data-sort-handle={_narrow ? "true" : undefined}
            aria-label={_preview}
            style={{
              touchAction: _narrow && !_disabled ? "none" : undefined,
            }}
          >
            <div class="relative flex min-w-0 flex-1 items-center gap-1.5 ps-2">
              <div class="relative flex w-[18px] shrink-0 items-center gap-[5px]">
                {!_narrow && (
                  <button
                    type="button"
                    disabled={_disabled}
                    aria-label={content.reorder}
                    data-sort-handle="true"
                    data-drag-handle={_disabled ? "disabled" : "enabled"}
                    class={`absolute top-1/2 -left-[15px] inline-flex h-4 w-3 -translate-y-1/2 touch-none items-center justify-center border-0 bg-transparent p-0 text-muted-foreground outline-none transition-opacity ${false ? "cursor-grabbing opacity-100" : "cursor-grab opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
                  >
                    <Drag theme="outline" size={12} strokeWidth={2.5} />
                  </button>
                )}
                <span
                  aria-hidden="true"
                  class="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground"
                >
                  <CornerDownRight
                    theme="outline"
                    size={12}
                    strokeWidth={2.3}
                  />
                </span>
              </div>
              <p
                class="min-w-0 flex-1 truncate text-[11px] leading-4 text-[var(--color-text-2)]"
                title={_message.content}
              >
                {_preview}
              </p>
            </div>
            <div class="flex h-6 shrink-0 items-center gap-0.5 overflow-hidden">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-6 rounded-full text-[var(--mu-primary-fill)] opacity-72 hover:opacity-100"
                disabled={_disabled}
                aria-label={content.sendNow}
                title={content.sendNow}
                onClick={_onSend}
              >
                <SendOne theme="outline" size={14} strokeWidth={2.5} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-6 rounded-full text-muted-foreground opacity-72 hover:opacity-100"
                disabled={_disabled || _editDisabled}
                aria-label={content.edit}
                title={_editDisabled ? content.draftOccupied : content.edit}
                onClick={_onEdit}
              >
                <Edit theme="outline" size={14} strokeWidth={2.5} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-6 rounded-full text-destructive opacity-72 hover:opacity-100"
                disabled={_disabled}
                aria-label={content.remove}
                title={content.remove}
                onClick={_onRemove}
              >
                <Delete theme="outline" size={14} strokeWidth={2.5} />
              </Button>
            </div>
          </div>
        </div>
      );
    };
  },
  {
    name: "QueuedMessageRow",
    inheritAttrs: false,
    props: [
      "message",
      "disabled",
      "editDisabled",
      "narrow",
      "onEdit",
      "onRemove",
      "onSend",
    ],
  },
);
