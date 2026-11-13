import { Button } from "@/components/ui/button";
import type { AgentTurn, ToolCall } from "@/features/agent/api";
import { AttachmentStrip } from "@/features/attachments/AttachmentStrip";
import { collectImageOffloads } from "@/features/attachments/image-offloads";
import type { Confirmation } from "@/features/confirmations/api";
import { pendingInboxMessages } from "@/features/conversation/inbox";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { streamPresentation } from "@/features/events/stream/stream-presentation";
import type { MessageStatus, SessionMessage } from "@/features/messages/api";
import { collectMessageBlocks } from "@/features/messages/model/message-blocks";
import { collectMessageReasoning } from "@/features/messages/model/reasoning";
import {
  collectReplyCopyRows,
  formatMessageTime,
} from "@/features/messages/model/reply-actions";
import type { MessageNavigation } from "@/features/messages/navigation/MessageNavigationContext";
import { AssistantContent } from "@/features/messages/rendering/AssistantContent";
import { CopyButton } from "@/features/messages/rendering/CopyButton";
import { ModelRetryStatus } from "@/features/messages/rendering/ModelRetryStatus";
import { PlanCards } from "@/features/plans/PlanCards";
import { SessionEmptyState } from "@/features/sessions/SessionEmptyState";
import { collectSessionSkills } from "@/features/skills/session-skills";
import { UserSkillText } from "@/features/skills/UserSkillText";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { ArrowDown, LoaderCircle, MessageCircle } from "lucide-vue-next";
import {
  computed,
  defineComponent,
  shallowRef,
  toRefs,
  type VNodeChild,
} from "vue";
const content = zhCN.conversation;
interface MessageListProps {
  readonly emptyState?: VNodeChild;
  readonly navigation: Pick<MessageNavigation, "pendingJump" | "acknowledge">;
  readonly footer?: VNodeChild;
  readonly confirmations: readonly Confirmation[];
  readonly messages: readonly SessionMessage[];
  readonly turns: readonly AgentTurn[];
}
const statusLabels: Record<Exclude<MessageStatus, "completed">, string> = {
  streaming: content.status.streaming,
  interrupted: content.status.interrupted,
  failed: content.status.failed,
  cancelled: content.status.cancelled,
};
export const MessageList = defineComponent(
  (componentProps: MessageListProps, { slots: _slots }) => {
    const emptyState = computed(() => componentProps.emptyState),
      navigation = computed(() => componentProps.navigation),
      confirmations = computed(() => componentProps.confirmations),
      footer = computed(() => componentProps.footer),
      messages = computed(() => componentProps.messages),
      turns = computed(() => componentProps.turns);
    const { events, records, activeAssistant } = toRefs(useSessionEvents());
    const imageOffloads = computed(() => collectImageOffloads(records.value));
    const repairedAttempts = computed(
      () =>
        new Set(
          records.value
            .filter(
              (record) =>
                record.eventType === "model.attempt.finished" &&
                record.payload.error_code === "IMAGE_OFFLOAD_REQUIRED",
            )
            .map((record) => record.messageId),
        ),
    );
    const skillsByMessage = computed(
      () => collectSessionSkills(events.value).byMessage,
    );
    const live = computed(() => {
      if (activeAssistant.value === null) return null;
      return streamPresentation(activeAssistant.value.stream);
    });
    const visibleMessages = computed(() =>
      live.value === null || activeAssistant.value === null
        ? messages.value
        : messages.value.map((message) =>
            message.id === activeAssistant.value?.attempt_id
              ? {
                  ...message,
                  content: live.value!.text,
                }
              : message,
          ),
    );
    const reasoningByMessage = computed(() =>
      collectMessageReasoning(records.value),
    );
    const settledBlocks = computed(() => collectMessageBlocks(records.value));
    const pendingSteering = computed(() =>
      pendingInboxMessages(records.value, "next-step"),
    );
    const timeline = computed(() => {
      const sequenceByMessage = new Map<string, number>();
      for (const record of records.value) {
        if (
          record.messageId !== null &&
          !sequenceByMessage.has(record.messageId)
        ) {
          sequenceByMessage.set(record.messageId, record.sequence);
        }
      }
      const results = new Map(
        records.value
          .filter((record) => record.eventType === "command/done")
          .map((record) => [record.entityId, record]),
      );
      return [
        ...visibleMessages.value
          .filter(
            (message) => message.role !== "user" || message.run_id !== null,
          )
          .filter(
            (message) =>
              !(
                repairedAttempts.value.has(message.id) &&
                message.content.length === 0 &&
                (reasoningByMessage.value.get(message.id)?.text.length ?? 0) ===
                  0
              ),
          )
          .map((message) => ({
            kind: "message" as const,
            id: message.id,
            sequence:
              sequenceByMessage.get(message.id) ?? message.updated_sequence,
            message,
          })),
        ...records.value
          .filter((record) => record.eventType === "command/run")
          .map((record) => ({
            kind: "command" as const,
            id: record.entityId,
            sequence: record.sequence,
            record,
            result: results.get(record.entityId),
          })),
      ].sort((left, right) => left.sequence - right.sequence);
    });
    const lastAssistantByRun = computed(() => {
      const last = new Map<string, string>();
      for (const item of timeline.value)
        if (
          item.kind === "message" &&
          item.message.role === "assistant" &&
          item.message.run_id !== null
        )
          last.set(item.message.run_id, item.id);
      return last;
    });
    const processing = computed(() =>
      turns.value.some((turn) =>
        [
          "ready",
          "model_running",
          "tool_running",
          "waiting_input",
          "waiting_confirmation",
        ].includes(turn.state),
      ),
    );
    const replyCopyRows = computed(() =>
      collectReplyCopyRows(
        timeline.value.flatMap((item) =>
          item.kind === "message" ? [item.message] : [],
        ),
        settledBlocks.value,
        processing.value,
      ),
    );
    const endRef = shallowRef<HTMLDivElement | null>(null);
    const followStreamRef = shallowRef(true);
    const jumpingRef = shallowRef(false);
    const jumpTargetRef = shallowRef<HTMLElement | null>(null);
    const awayFromEnd = shallowRef(false),
      setAwayFromEnd = refSetter(awayFromEnd);
    const toolsByMessage = computed(() => {
      const grouped = new Map<string, ToolCall[]>();
      for (const tool of turns.value.flatMap((turn) => turn.tool_calls)) {
        const current = grouped.get(tool.message_id) ?? [];
        current.push(tool);
        grouped.set(tool.message_id, current);
      }
      for (const tools of grouped.values()) {
        tools.sort((left, right) => left.batch_index - right.batch_index);
      }
      return grouped;
    });
    watchMounted([() => timeline.value.length === 0], () => {
      const scroller = endRef.value?.closest<HTMLElement>(
        "[data-message-scroll]",
      );
      if (scroller === undefined || scroller === null) return;
      const trackPosition = () => {
        if (jumpingRef.value) {
          setAwayFromEnd(true);
          return;
        }
        const distanceFromEnd =
          scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        followStreamRef.value = distanceFromEnd < 80;
        setAwayFromEnd(!followStreamRef.value);
      };
      const finishJump = () => {
        jumpingRef.value = false;
        trackPosition();
      };
      const releaseAnchor = () => {
        jumpTargetRef.value = null;
        jumpingRef.value = false;
      };
      const keyScroll = (event: KeyboardEvent) => {
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "PageUp",
            "PageDown",
            "Home",
            "End",
            " ",
          ].includes(event.key)
        )
          releaseAnchor();
      };
      const list = endRef.value?.parentElement;
      const observer = new ResizeObserver(() => {
        const target = jumpTargetRef.value;
        if (target === null) return;
        const top = Math.max(
          0,
          Math.min(
            scroller.scrollHeight - scroller.clientHeight,
            scroller.scrollTop +
              target.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top -
              12,
          ),
        );
        if (Math.abs(top - scroller.scrollTop) > 1)
          scroller.scrollTo({
            top,
            behavior: "instant",
          });
      });
      if (list !== null && list !== undefined) observer.observe(list);
      scroller.addEventListener("scroll", trackPosition, {
        passive: true,
      });
      scroller.addEventListener("scrollend", finishJump);
      scroller.addEventListener("wheel", releaseAnchor, {
        passive: true,
      });
      scroller.addEventListener("touchstart", releaseAnchor, {
        passive: true,
      });
      scroller.addEventListener("pointerdown", releaseAnchor);
      scroller.addEventListener("keydown", keyScroll);
      return () => {
        observer.disconnect();
        scroller.removeEventListener("scroll", trackPosition);
        scroller.removeEventListener("scrollend", finishJump);
        scroller.removeEventListener("wheel", releaseAnchor);
        scroller.removeEventListener("touchstart", releaseAnchor);
        scroller.removeEventListener("pointerdown", releaseAnchor);
        scroller.removeEventListener("keydown", keyScroll);
      };
    });
    watchMounted(
      [
        () => navigation.value.pendingJump,
        () => navigation.value.acknowledge,
        () => timeline.value,
      ],
      () => {
        const request = navigation.value.pendingJump;
        if (request === null || timeline.value.length === 0) return;
        const target = document.getElementById(`message-${request.messageId}`);
        const scroller = endRef.value?.closest<HTMLElement>(
          "[data-message-scroll]",
        );
        if (target === null || scroller === undefined || scroller === null)
          throw new Error(
            "The requested message anchor is not rendered in its conversation.",
          );
        const top = Math.max(
          0,
          Math.min(
            scroller.scrollHeight - scroller.clientHeight,
            scroller.scrollTop +
              target.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top -
              12,
          ),
        );
        followStreamRef.value = false;
        jumpTargetRef.value = target;
        jumpingRef.value = Math.abs(top - scroller.scrollTop) > 1;
        setAwayFromEnd(true);
        target.focus({
          preventScroll: true,
        });
        scroller.scrollTo({
          top,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
        navigation.value.acknowledge(request.id);
      },
    );
    watchMounted(
      [
        () => messages.value,
        () => turns.value,
        () => timeline.value,
        () => reasoningByMessage.value,
      ],
      () => {
        if (followStreamRef.value) {
          const scroller = endRef.value?.closest<HTMLElement>(
            "[data-message-scroll]",
          );
          scroller?.scrollTo({
            top: scroller.scrollHeight,
            behavior: "instant",
          });
        }
      },
    );
    return () => {
      const _timeline = timeline.value,
        _emptyState = emptyState.value,
        _toolsByMessage = toolsByMessage.value,
        _live = live.value,
        _reasoningByMessage = reasoningByMessage.value,
        _turns = turns.value,
        _skillsByMessage = skillsByMessage.value,
        _imageOffloads = imageOffloads.value,
        _settledBlocks = settledBlocks.value,
        _confirmations = confirmations.value,
        _lastAssistantByRun = lastAssistantByRun.value,
        _pendingSteering = pendingSteering.value,
        _replyCopyRows = replyCopyRows.value,
        _footer = footer.value;
      if (_timeline.length === 0) {
        if (_emptyState !== undefined) return _emptyState;
        return (
          <SessionEmptyState
            description={content.emptyDescription}
            icon={MessageCircle}
            title={content.emptyTitle}
          />
        );
      }
      return (
        <div class="chat-surface-fluid flex flex-col gap-4 px-3 py-5">
          {_timeline.map((item) => {
            if (item.kind === "command") {
              return (
                <article
                  key={item.id}
                  class="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground"
                >
                  <div class="font-mono">
                    /{String(item.record.payload.name)}
                    {typeof item.record.payload.raw_input === "string"
                      ? item.record.payload.raw_input
                      : ""}
                  </div>
                  <div
                    role="status"
                    class={`mt-1 whitespace-pre-wrap ${item.result?.payload.kind === "error" ? "text-destructive" : ""}`}
                  >
                    {typeof item.result?.payload.text === "string"
                      ? item.result.payload.text
                      : zhCN.conversation.commands.running}
                  </div>
                </article>
              );
            }
            const message = item.message;
            const tools = _toolsByMessage.get(message.id) ?? [];
            const generating =
              activeAssistant.value?.attempt_id === message.id &&
              _live !== null;
            const reasoning = generating
              ? (_live.reasoning ?? undefined)
              : _reasoningByMessage.get(message.id);
            const activeTurn = _turns.find(
              (turn) => turn.id === message.run_id,
            );
            const active =
              generating ||
              (activeTurn?.state === "model_running" &&
                message.status === "streaming" &&
                activeTurn.step === message.step &&
                activeTurn.attempt === message.attempt);
            return (
              <article
                key={message.id}
                id={`message-${message.id}`}
                data-message-id={message.id}
                data-message-role={message.role}
                tabindex={-1}
                class={
                  message.role === "user"
                    ? "group ml-auto flex w-full flex-col items-end"
                    : "group mr-auto flex w-full flex-col items-start"
                }
              >
                {message.role === "user" ? (
                  <div class="max-w-full [--attachment-surface:var(--message-user-bg)] rounded-[8px_0_8px_8px] bg-[var(--message-user-bg)] p-1.5 md:p-2 text-[13px] leading-5 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
                    {message.content.length > 0 && (
                      <span data-reply-content={message.id}>
                        <UserSkillText
                          text={message.content}
                          skills={_skillsByMessage.get(message.id) ?? new Map()}
                        />
                      </span>
                    )}
                    <AttachmentStrip
                      sessionId={message.session_id}
                      attachments={message.attachments}
                      offloadedIds={_imageOffloads.get(message.id)}
                    />
                    {_imageOffloads.has(message.id) && (
                      <p class="text-[11px] text-muted-foreground">
                        {content.attachments.offloadSummary(
                          _imageOffloads.get(message.id)!.size,
                        )}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <AssistantContent
                      runState={
                        activeTurn === undefined ? null : activeTurn.state
                      }
                      blocks={
                        generating
                          ? _live.blocks
                          : _settledBlocks.has(message.id)
                            ? _settledBlocks.get(message.id)!
                            : [
                                ...(reasoning === undefined
                                  ? []
                                  : [
                                      {
                                        type: "reasoning" as const,
                                        index: 0,
                                        text: reasoning.text,
                                        startedAt: reasoning.startedAt,
                                        finishedAt: reasoning.finishedAt,
                                      },
                                    ]),
                                {
                                  type: "text" as const,
                                  index: 1,
                                  text: message.content,
                                  startedAt: null,
                                  finishedAt: null,
                                },
                              ]
                      }
                      messageId={message.id}
                      active={active}
                      generating={generating}
                      updatedAt={message.updated_at}
                      tools={tools}
                      confirmations={_confirmations}
                    />
                    {active && message.content.length > 0 && (
                      <span class="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-muted-foreground align-text-bottom" />
                    )}
                    {active &&
                      message.content.length === 0 &&
                      reasoning === undefined && (
                        <div
                          class="flex items-center gap-2 py-1 text-[13px] text-muted-foreground"
                          role="status"
                        >
                          <LoaderCircle
                            class="size-3.5 animate-spin"
                            aria-hidden="true"
                          />
                          {content.status.streaming}
                        </div>
                      )}
                  </>
                )}
                {message.role === "assistant" &&
                  message.run_id !== null &&
                  _lastAssistantByRun.get(message.run_id) === message.id &&
                  _turns.some(
                    (turn) =>
                      turn.id === message.run_id &&
                      ["completed", "failed", "cancelled"].includes(turn.state),
                  ) && (
                    <PlanCards
                      tools={
                        _turns.find((turn) => turn.id === message.run_id)!
                          .tool_calls
                      }
                    />
                  )}
                {(message.status !== "completed" ||
                  _pendingSteering.has(message.id)) && (
                  <div class="mt-1 flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
                    {_pendingSteering.has(message.id) && (
                      <span role="status">{content.steeringQueued}</span>
                    )}
                    {message.status !== "completed" ? (
                      <span
                        class="inline-flex items-center gap-1"
                        role="status"
                      >
                        {message.status === "streaming" ? (
                          <LoaderCircle
                            class="size-3 animate-spin"
                            aria-hidden="true"
                          />
                        ) : null}
                        {statusLabels[message.status]}
                        {message.attempt !== null && message.attempt > 1
                          ? ` · ${content.attempt(message.attempt)}`
                          : null}
                      </span>
                    ) : null}
                  </div>
                )}
                {(message.role === "user" ||
                  _replyCopyRows.has(message.id)) && (
                  <div
                    data-message-actions={message.id}
                    class={`message-actions mt-1 flex h-8 items-center gap-2 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    {message.role === "user" ? (
                      message.content.length > 0 && (
                        <CopyButton text={message.content} />
                      )
                    ) : (
                      <CopyButton text={_replyCopyRows.get(message.id)!} />
                    )}
                    <time datetime={message.created_at}>
                      {formatMessageTime(message.created_at)}
                    </time>
                  </div>
                )}
              </article>
            );
          })}
          <ModelRetryStatus turns={_turns} />
          {_footer}
          <div ref={endRef} />
          {awayFromEnd.value && (
            <div class="sticky bottom-2 z-10 flex h-0 justify-center">
              <Button
                type="button"
                variant="outline"
                class="h-7 -translate-y-full gap-1.5 rounded-full bg-background py-0 ps-2.5 pe-2 text-xs font-normal text-t-secondary"
                aria-label={content.scrollToBottom}
                onClick={() => {
                  followStreamRef.value = true;
                  jumpingRef.value = false;
                  jumpTargetRef.value = null;
                  const scroller = endRef.value?.closest<HTMLElement>(
                    "[data-message-scroll]",
                  );
                  scroller?.scrollTo({
                    top: scroller.scrollHeight,
                    behavior: "smooth",
                  });
                }}
              >
                {content.scrollToBottom}
                <ArrowDown class="size-3" />
              </Button>
            </div>
          )}
        </div>
      );
    };
  },
  {
    name: "MessageList",
    inheritAttrs: false,
    props: [
      "emptyState",
      "navigation",
      "confirmations",
      "footer",
      "messages",
      "turns",
    ],
  },
);
