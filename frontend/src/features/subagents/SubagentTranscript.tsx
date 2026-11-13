import { Button } from "@/components/ui/button";
import { listAgentTurns } from "@/features/agent/api";
import { conversationAssembler } from "@/features/conversation/assembler";
import { EventStreamNotice } from "@/features/events/EventStreamNotice";
import {
  SessionEventProvider,
  useSessionEvents,
} from "@/features/events/SessionEventContext";
import { TrajectoryInspector } from "@/features/events/trajectory/inspector/TrajectoryInspector";
import "@/features/events/trajectory/trajectory-theme.css";
import { TrajectoryLedger } from "@/features/events/trajectory/TrajectoryLedger";
import { listMessages } from "@/features/messages/api";
import type { MessageNavigation } from "@/features/messages/navigation/MessageNavigationContext";
import { MessageList } from "@/features/messages/rendering/MessageList";
import { getSession } from "@/features/sessions/api";
import { SessionWorkspaceProvider } from "@/features/sessions/SessionWorkspaceContext";
import type { Subagent } from "@/features/subagents/api";
import css from "@/features/subagents/subagents.module.css";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, defineComponent, reactive, shallowRef } from "vue";
export const SubagentTranscript = defineComponent(
  (
    componentProps: {
      readonly child: Subagent;
      readonly tab: "conversation" | "trajectory";
    },
    { slots: _slots },
  ) => {
    const child = computed(() => componentProps.child),
      tab = computed(() => componentProps.tab);
    return () => {
      const _child = child.value,
        _tab = tab.value;
      return (
        <SessionEventProvider key={_child.child_id} sessionId={_child.child_id}>
          <Transcript child={_child} tab={_tab} />
        </SessionEventProvider>
      );
    };
  },
  {
    name: "SubagentTranscript",
    inheritAttrs: false,
    props: ["child", "tab"],
  },
);
const Transcript = defineComponent(
  (
    componentProps: {
      readonly child: Subagent;
      readonly tab: "conversation" | "trajectory";
    },
    { slots: _slots },
  ) => {
    const child = computed(() => componentProps.child),
      tab = computed(() => componentProps.tab);
    const stream = useSessionEvents(),
      client = useQueryClient();
    const key = computed(
      () => ["subagent-transcript", child.value.child_id] as const,
    );
    const query = reactive(
      useQuery(
        computed(() => ({
          queryKey: key.value,
          queryFn: async ({ signal }: { signal: AbortSignal }) => {
            const [session, messages, turns] = await Promise.all([
              getSession(child.value.child_id),
              listMessages(child.value.child_id, signal),
              listAgentTurns(child.value.child_id),
            ]);
            return {
              session,
              messages,
              turns,
            };
          },
          retry: false,
        })),
      ),
    );
    const revision = computed(() => stream.events.at(-1)?.sequence);
    watchMounted(
      [() => client, () => child.value.child_id, () => revision.value],
      () => {
        if (revision.value !== undefined)
          void client.invalidateQueries({
            queryKey: ["subagent-transcript", child.value.child_id],
          });
      },
    );
    const records = computed(() =>
      query.data === undefined
        ? []
        : conversationAssembler.assemble("trajectory", {
            messages: query.data.messages,
            turns: query.data.turns,
            confirmations: [],
            events: stream.records,
            activeAssistant: stream.activeAssistant,
          }).records,
    );
    const selected = shallowRef<number | null>(null),
      setSelected = refSetter(selected);
    const collapsed = shallowRef<ReadonlySet<number>>(new Set()),
      setCollapsed = refSetter(collapsed);
    const _revision = shallowRef(440),
      setDetailWidth = refSetter(_revision);
    const jump = shallowRef<MessageNavigation["pendingJump"]>(null),
      setJump = refSetter(jump);
    const selection = computed(() =>
      records.value.find((record) => record.index === selected.value),
    );
    return () => {
      const _tab2 = tab.value,
        _records = records.value,
        _selection = selection.value;
      if (query.isPending)
        return (
          <p role="status" class="p-5 text-sm text-muted-foreground">
            {zhCN.subagents.loading}
          </p>
        );
      if (query.isError)
        return (
          <p role="alert" class="p-5 text-sm text-destructive">
            {zhCN.subagents.loadFailed}
            <Button variant="ghost" onClick={() => void query.refetch()}>
              {zhCN.conversation.retry}
            </Button>
          </p>
        );
      return (
        <SessionWorkspaceProvider session={query.data.session}>
          {stream.status !== "connected" && (
            <EventStreamNotice error={stream.error} status={stream.status} />
          )}
          {_tab2 === "conversation" ? (
            <div
              data-message-scroll
              class="message-list-scroller h-full min-h-0 overflow-y-auto"
            >
              <MessageList
                emptyState={
                  <p role="status" class="p-5 text-sm text-muted-foreground">
                    {zhCN.subagents.waitingMessages}
                  </p>
                }
                navigation={{
                  pendingJump: jump.value,
                  acknowledge: (id) =>
                    setJump((current) => (current?.id === id ? null : current)),
                }}
                messages={query.data.messages}
                turns={query.data.turns}
                confirmations={[]}
              />
            </div>
          ) : (
            <div class={css.trace}>
              <TrajectoryLedger
                records={_records}
                selectedIndex={selected.value}
                focusedIndex={null}
                searchMatches={null}
                rangeMatches={null}
                onSelect={setSelected}
                collapsedTurns={collapsed.value}
                onToggleTurn={(turn) =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(turn)) next.delete(turn);
                    else next.add(turn);
                    return next;
                  })
                }
              />
              {_selection !== undefined && (
                <TrajectoryInspector
                  key={_selection.id}
                  record={_selection}
                  onClose={() => setSelected(null)}
                  onWidthChange={setDetailWidth}
                />
              )}
            </div>
          )}
        </SessionWorkspaceProvider>
      );
    };
  },
  {
    name: "Transcript",
    inheritAttrs: false,
    props: ["child", "tab"],
  },
);
