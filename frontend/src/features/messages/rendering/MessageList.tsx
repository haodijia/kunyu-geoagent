import { ArrowDown, LoaderCircle, MessageCircle } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { AttachmentStrip } from "@/features/attachments/AttachmentStrip";
import { collectImageOffloads } from "@/features/attachments/image-offloads";

import type { AgentTurn, ToolCall } from "@/features/agent/api";
import type { Confirmation } from "@/features/confirmations/api";
import { pendingInboxMessages } from "@/features/conversation/inbox";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import type { MessageStatus, SessionMessage } from "@/features/messages/api";
import { CopyButton } from "@/features/messages/rendering/CopyButton";
import { ModelRetryStatus } from "@/features/messages/rendering/ModelRetryStatus";
import { collectMessageReasoning } from "@/features/messages/model/reasoning";
import { SessionEmptyState } from "@/features/sessions/SessionEmptyState";
import { zhCN } from "@/locales/zh-CN";

import { streamPresentation } from "@/features/events/stream/stream-presentation";
import { collectMessageBlocks } from "@/features/messages/model/message-blocks";
import { collectSessionSkills } from "@/features/skills/session-skills";
import { UserSkillText } from "@/features/skills/UserSkillText";

import type { MessageNavigation } from "@/features/messages/navigation/MessageNavigationContext";
import { AssistantContent } from "@/features/messages/rendering/AssistantContent";
import {
  collectReplyCopyRows,
  formatMessageTime,
} from "@/features/messages/model/reply-actions";
import { PlanCards } from "@/features/plans/PlanCards";

const content = zhCN.conversation;

interface MessageListProps {
  readonly emptyState?: ReactNode;
  readonly navigation: Pick<MessageNavigation, "pendingJump" | "acknowledge">;
  readonly footer?: ReactNode;
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

export function MessageList({
  emptyState,
  navigation,
  confirmations,
  footer,
  messages,
  turns,
}: MessageListProps) {
  const { events, records, activeAssistant } = useSessionEvents();
  const imageOffloads = useMemo(() => collectImageOffloads(records), [records]);
  const repairedAttempts = useMemo(() => new Set(records.filter((record) => record.eventType === "model.attempt.finished" && record.payload.error_code === "IMAGE_OFFLOAD_REQUIRED").map((record) => record.messageId)), [records]);
  const skillsByMessage = useMemo(() => collectSessionSkills(events).byMessage, [events]);
  const live = useMemo(() => {
    if (activeAssistant === null) return null;
    return streamPresentation(activeAssistant.stream);
  }, [activeAssistant]);
  const visibleMessages = useMemo(
    () =>
      live === null || activeAssistant === null
        ? messages
        : messages.map((message) =>
            message.id === activeAssistant.attempt_id
              ? { ...message, content: live.text }
              : message,
          ),
    [messages, live, activeAssistant],
  );
  const reasoningByMessage = useMemo(
    () => collectMessageReasoning(records),
    [records],
  );
  const settledBlocks = useMemo(() => collectMessageBlocks(records), [records]);
  const pendingSteering = useMemo(
    () => pendingInboxMessages(records, "next-step"),
    [records],
  );
  const timeline = useMemo(() => {
    const sequenceByMessage = new Map<string, number>();
    for (const record of records) {
      if (
        record.messageId !== null &&
        !sequenceByMessage.has(record.messageId)
      ) {
        sequenceByMessage.set(record.messageId, record.sequence);
      }
    }
    const results = new Map(
      records
        .filter((record) => record.eventType === "command/done")
        .map((record) => [record.entityId, record]),
    );
    return [
      ...visibleMessages
        .filter((message) => message.role !== "user" || message.run_id !== null)
        .filter((message) => !(repairedAttempts.has(message.id) && message.content.length === 0
          && (reasoningByMessage.get(message.id)?.text.length ?? 0) === 0))
        .map((message) => ({
          kind: "message" as const,
          id: message.id,
          sequence:
            sequenceByMessage.get(message.id) ?? message.updated_sequence,
          message,
        })),
      ...records
        .filter((record) => record.eventType === "command/run")
        .map((record) => ({
          kind: "command" as const,
          id: record.entityId,
          sequence: record.sequence,
          record,
          result: results.get(record.entityId),
        })),
    ].sort((left, right) => left.sequence - right.sequence);
  }, [visibleMessages, records, repairedAttempts, reasoningByMessage]);
  const lastAssistantByRun = useMemo(() => {
    const last = new Map<string, string>();
    for (const item of timeline) if (item.kind === "message" && item.message.role === "assistant" && item.message.run_id !== null) last.set(item.message.run_id, item.id);
    return last;
  }, [timeline]);
  const processing = turns.some((turn) => ["ready", "model_running", "tool_running", "waiting_input", "waiting_confirmation"].includes(turn.state));
  const replyCopyRows = useMemo(() => collectReplyCopyRows(
    timeline.flatMap((item) => item.kind === "message" ? [item.message] : []),
    settledBlocks,
    processing,
  ), [timeline, settledBlocks, processing]);
  const endRef = useRef<HTMLDivElement>(null);
  const followStreamRef = useRef(true);
  const jumpingRef = useRef(false);
  const jumpTargetRef = useRef<HTMLElement | null>(null);
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  const toolsByMessage = useMemo(() => {
    const grouped = new Map<string, ToolCall[]>();
    for (const tool of turns.flatMap((turn) => turn.tool_calls)) {
      const current = grouped.get(tool.message_id) ?? [];
      current.push(tool);
      grouped.set(tool.message_id, current);
    }
    for (const tools of grouped.values()) {
      tools.sort((left, right) => left.batch_index - right.batch_index);
    }
    return grouped;
  }, [turns]);

  useEffect(() => {
    const scroller = endRef.current?.closest<HTMLElement>(
      "[data-message-scroll]",
    );
    if (scroller === undefined || scroller === null) return;
    const trackPosition = () => {
      if (jumpingRef.current) { setAwayFromEnd(true); return; }
      const distanceFromEnd =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      followStreamRef.current = distanceFromEnd < 80;
      setAwayFromEnd(!followStreamRef.current);
    };
    const finishJump = () => { jumpingRef.current = false; trackPosition(); };
    const releaseAnchor = () => { jumpTargetRef.current = null; jumpingRef.current = false; };
    const keyScroll = (event: KeyboardEvent) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) releaseAnchor(); };
    const list = endRef.current?.parentElement;
    const observer = new ResizeObserver(() => {
      const target = jumpTargetRef.current;
      if (target === null) return;
      const top = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12));
      if (Math.abs(top - scroller.scrollTop) > 1) scroller.scrollTo({ top, behavior: "instant" });
    });
    if (list !== null && list !== undefined) observer.observe(list);
    scroller.addEventListener("scroll", trackPosition, { passive: true });
    scroller.addEventListener("scrollend", finishJump);
    scroller.addEventListener("wheel", releaseAnchor, { passive: true });
    scroller.addEventListener("touchstart", releaseAnchor, { passive: true });
    scroller.addEventListener("pointerdown", releaseAnchor);
    scroller.addEventListener("keydown", keyScroll);
    return () => { observer.disconnect(); scroller.removeEventListener("scroll", trackPosition); scroller.removeEventListener("scrollend", finishJump); scroller.removeEventListener("wheel", releaseAnchor); scroller.removeEventListener("touchstart", releaseAnchor); scroller.removeEventListener("pointerdown", releaseAnchor); scroller.removeEventListener("keydown", keyScroll); };
  }, [timeline.length === 0]);

  useLayoutEffect(() => {
    const request = navigation.pendingJump;
    if (request === null || timeline.length === 0) return;
    const target = document.getElementById(`message-${request.messageId}`);
    const scroller = endRef.current?.closest<HTMLElement>("[data-message-scroll]");
    if (target === null || scroller === undefined || scroller === null) throw new Error("The requested message anchor is not rendered in its conversation.");
    const top = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12));
    followStreamRef.current = false;
    jumpTargetRef.current = target;
    jumpingRef.current = Math.abs(top - scroller.scrollTop) > 1;
    setAwayFromEnd(true);
    target.focus({ preventScroll: true });
    scroller.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    navigation.acknowledge(request.id);
  }, [navigation.pendingJump, navigation.acknowledge, timeline]);

  useEffect(() => {
    if (followStreamRef.current) {
      const scroller = endRef.current?.closest<HTMLElement>("[data-message-scroll]");
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "instant" });
    }
  }, [messages, turns, timeline, reasoningByMessage]);

  if (timeline.length === 0) {
    if (emptyState !== undefined) return emptyState;
    return (
      <SessionEmptyState
        description={content.emptyDescription}
        icon={MessageCircle}
        title={content.emptyTitle}
      />
    );
  }

  return (
    <div className="chat-surface-fluid flex flex-col gap-4 px-3 py-5">
      {timeline.map((item) => {
        if (item.kind === "command") {
          return (
            <article
              key={item.id}
              className="rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground"
            >
              <div className="font-mono">
                /{String(item.record.payload.name)}
                {typeof item.record.payload.raw_input === "string"
                  ? item.record.payload.raw_input
                  : ""}
              </div>
              <div
                role="status"
                className={`mt-1 whitespace-pre-wrap ${item.result?.payload.kind === "error" ? "text-destructive" : ""}`}
              >
                {typeof item.result?.payload.text === "string"
                  ? item.result.payload.text
                  : zhCN.conversation.commands.running}
              </div>
            </article>
          );
        }
        const message = item.message;
        const tools = toolsByMessage.get(message.id) ?? [];
        const generating =
          activeAssistant?.attempt_id === message.id && live !== null;
        const reasoning = generating
          ? (live.reasoning ?? undefined)
          : reasoningByMessage.get(message.id);
        const activeTurn = turns.find((turn) => turn.id === message.run_id);
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
            tabIndex={-1}
            className={
              message.role === "user"
                ? "group ml-auto flex w-full flex-col items-end"
                : "group mr-auto flex w-full flex-col items-start"
            }
          >
            {message.role === "user" ? (
              <div className="max-w-full [--attachment-surface:var(--message-user-bg)] rounded-[8px_0_8px_8px] bg-[var(--message-user-bg)] p-1.5 md:p-2 text-[13px] leading-5 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
                {message.content.length > 0 && <span data-reply-content={message.id}><UserSkillText text={message.content} skills={skillsByMessage.get(message.id) ?? new Map()} /></span>}
                <AttachmentStrip sessionId={message.session_id} attachments={message.attachments} offloadedIds={imageOffloads.get(message.id)} />
                {imageOffloads.has(message.id) && <p className="text-[11px] text-muted-foreground">{content.attachments.offloadSummary(imageOffloads.get(message.id)!.size)}</p>}
              </div>
            ) : (
              <>
                <AssistantContent
                  runState={activeTurn === undefined ? null : activeTurn.state}
                  blocks={
                    generating
                      ? live.blocks
                      : settledBlocks.has(message.id)
                        ? settledBlocks.get(message.id)!
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
                  confirmations={confirmations}
                />
                {active && message.content.length > 0 && (
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-muted-foreground align-text-bottom" />
                )}
                {active &&
                  message.content.length === 0 &&
                  reasoning === undefined && (
                    <div
                      className="flex items-center gap-2 py-1 text-[13px] text-muted-foreground"
                      role="status"
                    >
                      <LoaderCircle
                        className="size-3.5 animate-spin"
                        aria-hidden="true"
                      />
                      {content.status.streaming}
                    </div>
                  )}
              </>
            )}
            {message.role === "assistant" && message.run_id !== null && lastAssistantByRun.get(message.run_id) === message.id && turns.some(turn => turn.id === message.run_id && ["completed", "failed", "cancelled"].includes(turn.state)) && <PlanCards tools={turns.find(turn => turn.id === message.run_id)!.tool_calls} />}
            {(message.status !== "completed" || pendingSteering.has(message.id)) && <div className="mt-1 flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
              {pendingSteering.has(message.id) && (
                <span role="status">{content.steeringQueued}</span>
              )}
              {message.status !== "completed" ? (
                <span className="inline-flex items-center gap-1" role="status">
                  {message.status === "streaming" ? (
                    <LoaderCircle
                      className="size-3 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {statusLabels[message.status]}
                  {message.attempt !== null && message.attempt > 1
                    ? ` · ${content.attempt(message.attempt)}`
                    : null}
                </span>
              ) : null}
            </div>}
            {(message.role === "user" || replyCopyRows.has(message.id)) && (
              <div data-message-actions={message.id} className={`message-actions mt-1 flex h-8 items-center gap-2 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                {message.role === "user" ? message.content.length > 0 && <CopyButton text={message.content} /> : <CopyButton text={replyCopyRows.get(message.id)!} />}
                <time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>
              </div>
            )}
          </article>
        );
      })}
      <ModelRetryStatus turns={turns} />
      {footer}
      <div ref={endRef} />
      {awayFromEnd && (
        <div className="sticky bottom-2 z-10 flex h-0 justify-center">
          <Button
            type="button"
            variant="outline"
            className="h-7 -translate-y-full gap-1.5 rounded-full bg-background py-0 ps-2.5 pe-2 text-xs font-normal text-t-secondary"
            aria-label={content.scrollToBottom}
            onClick={() => {
              followStreamRef.current = true;
              jumpingRef.current = false;
              jumpTargetRef.current = null;
              const scroller = endRef.current?.closest<HTMLElement>("[data-message-scroll]");
              scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
            }}
          >
            {content.scrollToBottom}<ArrowDown className="size-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
