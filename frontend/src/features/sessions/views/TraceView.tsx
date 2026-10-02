import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EventStreamNotice } from "@/features/events/EventStreamNotice";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { TrajectoryLedger } from "@/features/events/TrajectoryLedger";
import { TrajectoryInspector } from "@/features/events/TrajectoryInspector";
import { TrajectoryTimeline } from "@/features/events/TrajectoryTimeline";
import { TrajectoryToolbar } from "@/features/events/TrajectoryToolbar";
import { trajectoryTurns } from "@/features/events/trajectory-model";
import { conversationAssembler } from "@/features/conversation/assembler";
import { trajectoryTranslate as t } from "@/features/events/trajectory-locales";
import {
  trajectoryTimelineFocusIndexes,
  type TrajectoryTimeRange,
} from "@/features/events/timeline";
import { useSessionMessages } from "@/features/messages/SessionMessagesContext";
import { SessionComposer } from "@/features/messages/SessionComposer";
import { zhCN } from "@/locales/zh-CN";
import css from "@/features/events/TrajectoryLedger.module.css";
import "@/features/events/trajectory-theme.css";

export function TraceView() {
  const eventStream = useSessionEvents();
  const { messagesQuery, agentTurnsQuery, confirmationsQuery } =
    useSessionMessages();
  const [query, setQuery] = useState("");
  const [actualDuration, setActualDuration] = useState(false);
  const [actualTime, setActualTime] = useState(false);
  const [range, setRange] = useState<TrajectoryTimeRange | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [detailWidth, setDetailWidth] = useState(440);
  const [collapsedTurns, setCollapsedTurns] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [collapsedCalls, setCollapsedCalls] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const records = useMemo(
    () =>
      conversationAssembler.assemble("trajectory", {
        events: eventStream.records,
        activeAssistant: eventStream.activeAssistant,
        messages: messagesQuery.data ?? [],
        turns: agentTurnsQuery.data ?? [],
        confirmations: confirmationsQuery.data ?? [],
      }).records,
    [
      confirmationsQuery.data,
      eventStream.records,
      eventStream.activeAssistant,
      messagesQuery.data,
      agentTurnsQuery.data,
    ],
  );
  const turns = useMemo(() => trajectoryTurns(records), [records]);
  const turnNumbers = useMemo(
    () => [
      ...new Set(
        records.flatMap((record) =>
          record.turn === null ? [] : [record.turn],
        ),
      ),
    ],
    [records],
  );
  const visibleRecords = useMemo(() => {
    const seen = new Set<number>();
    return records.filter((record) => {
      if (record.requestOnly === true) return false;
      if (record.turn !== null && collapsedTurns.has(record.turn)) {
        if (seen.has(record.turn)) return false;
        seen.add(record.turn);
      }
      return (
        !collapsedCalls ||
        (record.kind !== "tool" && record.kind !== "confirmation")
      );
    });
  }, [records, collapsedTurns, collapsedCalls]);
  const mode = actualDuration
    ? actualTime
      ? "actual"
      : "duration"
    : actualTime
      ? "time"
      : "sequence";
  const searchMatches = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("zh-CN");
    return value === ""
      ? null
      : new Set(
          records
            .filter((record) =>
              record.searchText.toLocaleLowerCase("zh-CN").includes(value),
            )
            .map((record) => record.index),
        );
  }, [query, records]);
  const rangeMatches = useMemo(
    () =>
      range === null
        ? null
        : trajectoryTimelineFocusIndexes(turns, range, mode),
    [turns, range, mode],
  );
  const selected = records.find((record) => record.index === selectedIndex);
  const selectRecord = useCallback((index: number | null) => {
    setSelectedIndex(index);
    setFocusedIndex(index);
    setRange(null);
  }, []);

  useLayoutEffect(() => {
    const element = composer.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => {
      root.current?.style.setProperty(
        "--dsh-trajectory-bottom-clearance",
        `${element.getBoundingClientRect().height + 16}px`,
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={root}
      lang="zh"
      className="trajectory-surface chat-surface-container relative flex h-full min-h-0 flex-col overflow-hidden bg-background"
    >
      <TrajectoryToolbar
        t={t}
        actualDuration={actualDuration}
        onActualDurationChange={(value) => {
          setActualDuration(value);
          setRange(null);
        }}
        actualTime={actualTime}
        onActualTimeChange={(value) => {
          setActualTime(value);
          setRange(null);
        }}
        allTurnsCollapsed={
          turnNumbers.length > 0 &&
          turnNumbers.every((turn) => collapsedTurns.has(turn))
        }
        onToggleAllTurns={() =>
          setCollapsedTurns(
            turnNumbers.every((turn) => collapsedTurns.has(turn))
              ? new Set()
              : new Set(turnNumbers),
          )
        }
        allAssistantsCollapsed={collapsedCalls}
        onToggleAllAssistants={() => setCollapsedCalls((value) => !value)}
        canCollapseTurns={turnNumbers.length > 0}
        canCollapseCalls={records.some((record) => record.kind === "tool")}
        searchQuery={query}
        onSearchQueryChange={setQuery}
      />
      <TrajectoryTimeline
        t={t}
        turns={turns}
        mode={mode}
        range={range}
        onRangeChange={setRange}
        selectedIndex={selectedIndex}
        searchMatchIndexes={searchMatches}
        onRecordSelect={selectRecord}
        onRecordFocus={setFocusedIndex}
      />
      {eventStream.status !== "connected" && (
        <EventStreamNotice
          error={eventStream.error}
          status={eventStream.status}
        />
      )}
      {messagesQuery.isPending && (
        <p className="m-0 border-b border-border py-2 text-center text-xs">
          {zhCN.conversation.loading}
        </p>
      )}
      {messagesQuery.isError && (
        <div
          role="alert"
          className="flex items-center justify-center gap-3 bg-destructive/10 py-2 text-xs text-destructive"
        >
          {zhCN.trajectory.loadMessagesFailed}
          <button type="button" onClick={() => void messagesQuery.refetch()}>
            {zhCN.conversation.retry}
          </button>
        </div>
      )}
      <div className={css.split}>
        <TrajectoryLedger
          records={visibleRecords}
          selectedIndex={selectedIndex}
          focusedIndex={focusedIndex}
          collapsedTurns={collapsedTurns}
          onToggleTurn={(turn) =>
            setCollapsedTurns((current) => {
              const next = new Set(current);
              if (next.has(turn)) next.delete(turn);
              else next.add(turn);
              return next;
            })
          }
          searchMatches={searchMatches}
          rangeMatches={rangeMatches}
          onSelect={selectRecord}
        />
        {selected !== undefined && (
          <TrajectoryInspector
            key={selected.id}
            record={selected}
            onWidthChange={setDetailWidth}
            onClose={() => selectRecord(null)}
          />
        )}
      </div>
      <div
        ref={composer}
        className="trajectory-composer pointer-events-none absolute bottom-0 left-0 z-10 [&>div]:pointer-events-auto"
        style={{ right: selected === undefined ? 0 : detailWidth }}
      >
        <SessionComposer />
      </div>
    </div>
  );
}
