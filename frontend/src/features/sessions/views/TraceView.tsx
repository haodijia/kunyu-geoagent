import { conversationAssembler } from "@/features/conversation/assembler";
import { EventStreamNotice } from "@/features/events/EventStreamNotice";
import { useSessionEvents } from "@/features/events/SessionEventContext";
import { TrajectoryLedger } from "@/features/events/trajectory/TrajectoryLedger";
import { TrajectoryToolbar } from "@/features/events/trajectory/TrajectoryToolbar";
import { TrajectoryInspector } from "@/features/events/trajectory/inspector/TrajectoryInspector";
import css from "@/features/events/trajectory/styles/TrajectoryLedger.module.css";
import { TrajectoryTimeline } from "@/features/events/trajectory/timeline/TrajectoryTimeline";
import {
  trajectoryTimelineFocusIndexes,
  type TrajectoryTimeRange,
} from "@/features/events/trajectory/timeline/timeline";
import { trajectoryTranslate as t } from "@/features/events/trajectory/trajectory-locales";
import { trajectoryTurns } from "@/features/events/trajectory/trajectory-model";
import "@/features/events/trajectory/trajectory-theme.css";
import { SessionComposer } from "@/features/messages/composer/SessionComposer";
import { useSessionMessages } from "@/features/messages/state/SessionMessagesContext";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { computed, defineComponent, shallowRef, toRefs } from "vue";
export const TraceView = defineComponent(
  (_props, { slots: _slots }) => {
    const eventStream = useSessionEvents();
    const { messagesQuery, agentTurnsQuery, confirmationsQuery } =
      toRefs(useSessionMessages());
    const query = shallowRef(""),
      setQuery = refSetter(query);
    const actualDuration = shallowRef(false),
      setActualDuration = refSetter(actualDuration);
    const actualTime = shallowRef(false),
      setActualTime = refSetter(actualTime);
    const range = shallowRef<TrajectoryTimeRange | null>(null),
      setRange = refSetter(range);
    const selectedIndex = shallowRef<number | null>(null),
      setSelectedIndex = refSetter(selectedIndex);
    const detailWidth = shallowRef(440),
      setDetailWidth = refSetter(detailWidth);
    const collapsedTurns = shallowRef<ReadonlySet<number>>(new Set()),
      setCollapsedTurns = refSetter(collapsedTurns);
    const collapsedCalls = shallowRef(false),
      setCollapsedCalls = refSetter(collapsedCalls);
    const focusedIndex = shallowRef<number | null>(null),
      setFocusedIndex = refSetter(focusedIndex);
    const root = shallowRef<HTMLDivElement | null>(null);
    const composer = shallowRef<HTMLDivElement | null>(null);
    const records = computed(
      () =>
        conversationAssembler.assemble("trajectory", {
          events: eventStream.records,
          activeAssistant: eventStream.activeAssistant,
          messages: messagesQuery.value.data ?? [],
          turns: agentTurnsQuery.value.data ?? [],
          confirmations: confirmationsQuery.value.data ?? [],
        }).records,
    );
    const turns = computed(() => trajectoryTurns(records.value));
    const turnNumbers = computed(() => [
      ...new Set(
        records.value.flatMap((record) =>
          record.turn === null ? [] : [record.turn],
        ),
      ),
    ]);
    const visibleRecords = computed(() => {
      const seen = new Set<number>();
      return records.value.filter((record) => {
        if (record.requestOnly === true) return false;
        if (record.turn !== null && collapsedTurns.value.has(record.turn)) {
          if (seen.has(record.turn)) return false;
          seen.add(record.turn);
        }
        return (
          !collapsedCalls.value ||
          (record.kind !== "tool" && record.kind !== "confirmation")
        );
      });
    });
    const mode = computed(() =>
      actualDuration.value
        ? actualTime.value
          ? "actual"
          : "duration"
        : actualTime.value
          ? "time"
          : "sequence",
    );
    const searchMatches = computed(() => {
      const value = query.value.trim().toLocaleLowerCase("zh-CN");
      return value === ""
        ? null
        : new Set(
            records.value
              .filter((record) =>
                record.searchText.toLocaleLowerCase("zh-CN").includes(value),
              )
              .map((record) => record.index),
          );
    });
    const rangeMatches = computed(() =>
      range.value === null
        ? null
        : trajectoryTimelineFocusIndexes(turns.value, range.value, mode.value),
    );
    const selected = computed(() =>
      records.value.find((record) => record.index === selectedIndex.value),
    );
    const selectRecord = (index: number | null) => {
      setSelectedIndex(index);
      setFocusedIndex(index);
      setRange(null);
    };
    watchMounted([], () => {
      const element = composer.value;
      if (element === null) return;
      const observer = new ResizeObserver(() => {
        root.value?.style.setProperty(
          "--dsh-trajectory-bottom-clearance",
          `${element.getBoundingClientRect().height + 16}px`,
        );
      });
      observer.observe(element);
      return () => observer.disconnect();
    });
    return () => {
      const _turnNumbers = turnNumbers.value,
        _records = records.value,
        _turns = turns.value,
        _mode = mode.value,
        _searchMatches = searchMatches.value,
        _visibleRecords = visibleRecords.value,
        _rangeMatches = rangeMatches.value,
        _selected = selected.value;
      return (
        <div
          ref={root}
          lang="zh"
          class="trajectory-surface chat-surface-container relative flex h-full min-h-0 flex-col overflow-hidden bg-background"
        >
          <TrajectoryToolbar
            t={t}
            actualDuration={actualDuration.value}
            onActualDurationChange={(value) => {
              setActualDuration(value);
              setRange(null);
            }}
            actualTime={actualTime.value}
            onActualTimeChange={(value) => {
              setActualTime(value);
              setRange(null);
            }}
            allTurnsCollapsed={
              _turnNumbers.length > 0 &&
              _turnNumbers.every((turn) => collapsedTurns.value.has(turn))
            }
            onToggleAllTurns={() =>
              setCollapsedTurns(
                _turnNumbers.every((turn) => collapsedTurns.value.has(turn))
                  ? new Set()
                  : new Set(_turnNumbers),
              )
            }
            allAssistantsCollapsed={collapsedCalls.value}
            onToggleAllAssistants={() => setCollapsedCalls((value) => !value)}
            canCollapseTurns={_turnNumbers.length > 0}
            canCollapseCalls={_records.some((record) => record.kind === "tool")}
            searchQuery={query.value}
            onSearchQueryChange={setQuery}
          />
          <TrajectoryTimeline
            t={t}
            turns={_turns}
            mode={_mode}
            range={range.value}
            onRangeChange={setRange}
            selectedIndex={selectedIndex.value}
            searchMatchIndexes={_searchMatches}
            onRecordSelect={selectRecord}
            onRecordFocus={setFocusedIndex}
          />
          {eventStream.status !== "connected" && (
            <EventStreamNotice
              error={eventStream.error}
              status={eventStream.status}
            />
          )}
          {messagesQuery.value.isPending && (
            <p class="m-0 border-b border-border py-2 text-center text-xs">
              {zhCN.conversation.loading}
            </p>
          )}
          {messagesQuery.value.isError && (
            <div
              role="alert"
              class="flex items-center justify-center gap-3 bg-destructive/10 py-2 text-xs text-destructive"
            >
              {zhCN.trajectory.loadMessagesFailed}
              <button
                type="button"
                onClick={() => void messagesQuery.value.refetch()}
              >
                {zhCN.conversation.retry}
              </button>
            </div>
          )}
          <div class={css.split}>
            <TrajectoryLedger
              records={_visibleRecords}
              selectedIndex={selectedIndex.value}
              focusedIndex={focusedIndex.value}
              collapsedTurns={collapsedTurns.value}
              onToggleTurn={(turn) =>
                setCollapsedTurns((current) => {
                  const next = new Set(current);
                  if (next.has(turn)) next.delete(turn);
                  else next.add(turn);
                  return next;
                })
              }
              searchMatches={_searchMatches}
              rangeMatches={_rangeMatches}
              onSelect={selectRecord}
            />
            {_selected !== undefined && (
              <TrajectoryInspector
                key={_selected.id}
                record={_selected}
                onWidthChange={setDetailWidth}
                onClose={() => selectRecord(null)}
              />
            )}
          </div>
          <div
            ref={composer}
            class="trajectory-composer pointer-events-none absolute bottom-0 left-0 z-10 [&>div]:pointer-events-auto"
            style={{
              right: `${_selected === undefined ? 0 : detailWidth.value}px`,
            }}
          >
            <SessionComposer />
          </div>
        </div>
      );
    };
  },
  {
    name: "TraceView",
    inheritAttrs: false,
    props: [],
  },
);
