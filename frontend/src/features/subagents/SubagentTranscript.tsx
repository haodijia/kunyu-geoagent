import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getSession } from "@/features/sessions/api";
import { SessionWorkspaceProvider } from "@/features/sessions/SessionWorkspaceContext";
import {
  SessionEventProvider,
  useSessionEvents,
} from "@/features/events/SessionEventContext";
import { EventStreamNotice } from "@/features/events/EventStreamNotice";
import { listMessages } from "@/features/messages/api";
import { listAgentTurns } from "@/features/agent/api";
import { MessageList } from "@/features/messages/MessageList";
import type { MessageNavigation } from "@/features/messages/navigation/MessageNavigationContext";
import { conversationAssembler } from "@/features/conversation/assembler";
import { TrajectoryLedger } from "@/features/events/TrajectoryLedger";
import { TrajectoryInspector } from "@/features/events/TrajectoryInspector";
import { zhCN } from "@/locales/zh-CN";
import type { Subagent } from "./api";
import css from "./subagents.module.css";
import "@/features/events/trajectory-theme.css";

export function SubagentTranscript({
  child,
  tab,
}: {
  readonly child: Subagent;
  readonly tab: "conversation" | "trajectory";
}) {
  return (
    <SessionEventProvider key={child.child_id} sessionId={child.child_id}>
      <Transcript child={child} tab={tab} />
    </SessionEventProvider>
  );
}
function Transcript({
  child,
  tab,
}: {
  readonly child: Subagent;
  readonly tab: "conversation" | "trajectory";
}) {
  const stream = useSessionEvents(),
    client = useQueryClient();
  const key = ["subagent-transcript", child.child_id] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const [session, messages, turns] = await Promise.all([
        getSession(child.child_id),
        listMessages(child.child_id, signal),
        listAgentTurns(child.child_id),
      ]);
      return { session, messages, turns };
    },
    retry: false,
  });
  const revision = stream.events.at(-1)?.sequence;
  useEffect(() => {
    if (revision !== undefined)
      void client.invalidateQueries({
        queryKey: ["subagent-transcript", child.child_id],
      });
  }, [client, child.child_id, revision]);
  const records = useMemo(
    () =>
      query.data === undefined
        ? []
        : conversationAssembler.assemble("trajectory", {
            messages: query.data.messages,
            turns: query.data.turns,
            confirmations: [],
            events: stream.records,
            activeAssistant: stream.activeAssistant,
          }).records,
    [query.data, stream.records, stream.activeAssistant],
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());
  const [, setDetailWidth] = useState(440);
  const [jump, setJump] = useState<MessageNavigation["pendingJump"]>(null);
  const selection = records.find((record) => record.index === selected);
  if (query.isPending)
    return (
      <p role="status" className="p-5 text-sm text-muted-foreground">
        {zhCN.subagents.loading}
      </p>
    );
  if (query.isError)
    return (
      <p role="alert" className="p-5 text-sm text-destructive">
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
      {tab === "conversation" ? (
        <div
          data-message-scroll
          className="message-list-scroller h-full min-h-0 overflow-y-auto"
        >
          <MessageList
            emptyState={
              <p role="status" className="p-5 text-sm text-muted-foreground">
                {zhCN.subagents.waitingMessages}
              </p>
            }
            navigation={{
              pendingJump: jump,
              acknowledge: (id) =>
                setJump((current) => (current?.id === id ? null : current)),
            }}
            messages={query.data.messages}
            turns={query.data.turns}
            confirmations={[]}
          />
        </div>
      ) : (
        <div className={css.trace}>
          <TrajectoryLedger
            records={records}
            selectedIndex={selected}
            focusedIndex={null}
            searchMatches={null}
            rangeMatches={null}
            onSelect={setSelected}
            collapsedTurns={collapsed}
            onToggleTurn={(turn) =>
              setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(turn)) next.delete(turn);
                else next.add(turn);
                return next;
              })
            }
          />
          {selection !== undefined && (
            <TrajectoryInspector
              key={selection.id}
              record={selection}
              onClose={() => setSelected(null)}
              onWidthChange={setDetailWidth}
            />
          )}
        </div>
      )}
    </SessionWorkspaceProvider>
  );
}
