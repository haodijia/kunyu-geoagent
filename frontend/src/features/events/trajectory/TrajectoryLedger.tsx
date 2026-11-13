import type { TrajectoryEventKind } from "@/features/events/projection/events";
import css from "@/features/events/trajectory/styles/TrajectoryLedger.module.css";
import type { TrajectoryRecord } from "@/features/events/trajectory/trajectory-model";
import { watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import {
  Braces,
  CircleHelp,
  Cpu,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
} from "lucide-vue-next";
import { computed, defineComponent, shallowRef, type VNodeChild } from "vue";
import { kindLabel } from "./labels";
const content = zhCN.trajectory;
interface Props {
  records: readonly TrajectoryRecord[];
  selectedIndex: number | null;
  focusedIndex: number | null;
  searchMatches: ReadonlySet<number> | null;
  rangeMatches: ReadonlySet<number> | null;
  onSelect: (index: number | null) => void;
  collapsedTurns: ReadonlySet<number>;
  onToggleTurn: (turn: number) => void;
}
export const TrajectoryLedger = defineComponent(
  (componentProps: Props, { slots: _slots }) => {
    const records = computed(() => componentProps.records),
      selectedIndex = computed(() => componentProps.selectedIndex),
      focusedIndex = computed(() => componentProps.focusedIndex),
      searchMatches = computed(() => componentProps.searchMatches),
      rangeMatches = computed(() => componentProps.rangeMatches),
      onSelect = computed(() => componentProps.onSelect),
      collapsedTurns = computed(() => componentProps.collapsedTurns),
      onToggleTurn = computed(() => componentProps.onToggleTurn);
    const pane = shallowRef<HTMLDivElement | null>(null);
    const follow = shallowRef(true);
    watchMounted([() => records.value.length], () => {
      if (pane.value !== null && follow.value)
        pane.value.scrollTop = pane.value.scrollHeight;
    });
    watchMounted([() => focusedIndex.value], () => {
      const index = focusedIndex.value;
      if (index === null) return;
      pane.value
        ?.querySelector<HTMLElement>(`[data-record-index="${index}"]`)
        ?.scrollIntoView({
          block: "nearest",
        });
    });
    return () => {
      const _onSelect = onSelect.value,
        _records = records.value,
        _selectedIndex = selectedIndex.value,
        _rangeMatches = rangeMatches.value,
        _searchMatches = searchMatches.value,
        _collapsedTurns = collapsedTurns.value,
        _onToggleTurn = onToggleTurn.value;
      return (
        <div
          ref={pane}
          class={css.tablePane}
          onScroll={(event) => {
            const element = event.currentTarget as HTMLElement;
            follow.value =
              element.scrollHeight - element.clientHeight - element.scrollTop <=
              2;
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) _onSelect(null);
          }}
        >
          <table
            class={css.table}
            data-scroll-ready="true"
            aria-label={content.ledgerLabel}
          >
            <colgroup>
              <col class={css.eventColumn} />
              <col class={css.contentColumn} />
              <col class={css.resultColumn} />
            </colgroup>
            <tbody>
              {_records
                .filter((record) => record.requestOnly !== true)
                .map((record, position, visible) => {
                  const selected = record.index === _selectedIndex;
                  const dimmed =
                    (_rangeMatches !== null &&
                      !_rangeMatches.has(record.index)) ||
                    (_searchMatches !== null &&
                      !_searchMatches.has(record.index));
                  const label = kindLabel(record.kind);
                  const previous = visible[position - 1];
                  const next = visible[position + 1];
                  const turnStart =
                    record.turn !== null && previous?.turn !== record.turn;
                  const turnEnd =
                    record.turn !== null && next?.turn !== record.turn;
                  return (
                    <tr
                      key={record.id}
                      tabindex={0}
                      aria-selected={selected}
                      aria-label={`${label}，${record.text}`}
                      data-record-index={record.index}
                      data-selected={selected || undefined}
                      data-kind={record.kind}
                      data-call-only={record.callOnly || undefined}
                      data-error={record.isError || undefined}
                      data-turn-start={turnStart || undefined}
                      data-turn-end={turnEnd || undefined}
                      data-timeline-focus={dimmed ? "outside" : undefined}
                      onClick={() => _onSelect(record.index)}
                      onKeydown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          _onSelect(record.index);
                        }
                      }}
                    >
                      <td class={css.event}>
                        {selected && (
                          <span class={css.selectionRail} aria-hidden="true" />
                        )}
                        {record.turn !== null && (
                          <span class={css.turnRail} aria-hidden="true" />
                        )}
                        {turnStart && (
                          <button
                            type="button"
                            class={`${css.turnLabel} ${selected ? css.turnLabelActive : ""}`}
                            aria-expanded={!_collapsedTurns.has(record.turn!)}
                            onClick={(event) => {
                              event.stopPropagation();
                              _onToggleTurn(record.turn!);
                            }}
                          >
                            <span class={css.turnLabelFull}>
                              {content.turnPrefix} {record.turn}{" "}
                              {content.turnSuffix}
                            </span>
                            <span class={css.turnLabelCompact}>
                              #{record.turn}
                            </span>
                          </button>
                        )}
                        <div class={css.eventInner}>
                          <span class={css.kindSlot}>
                            <span
                              class={`${css.kindTag} ${kindClass(record.kind)}`}
                              title={label}
                            >
                              <span class={css.kindTagIcon}>
                                {kindIcon(record.kind)}
                              </span>
                              <span class={css.kindTagLabel}>{label}</span>
                            </span>
                          </span>
                        </div>
                      </td>
                      <td
                        class={css.content}
                        colspan={record.kind === "tool" ? 1 : 2}
                      >
                        <span class={css.contentText} title={record.text}>
                          {record.text}
                        </span>
                      </td>
                      {record.kind === "tool" && (
                        <td class={css.result}>
                          <span class={css.contentText}>
                            {record.output === null
                              ? ""
                              : `→ ${typeof record.output === "string" ? record.output : JSON.stringify(record.output)}`}
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      );
    };
  },
  {
    name: "TrajectoryLedger",
    inheritAttrs: false,
    props: [
      "records",
      "selectedIndex",
      "focusedIndex",
      "searchMatches",
      "rangeMatches",
      "onSelect",
      "collapsedTurns",
      "onToggleTurn",
    ],
  },
);
function kindIcon(kind: TrajectoryEventKind): VNodeChild {
  switch (kind) {
    case "system":
      return <Cpu size={13} />;
    case "context":
      return <Braces size={13} />;
    case "user":
      return <UserRound size={13} />;
    case "assistant":
      return <Sparkles size={13} />;
    case "tool":
      return <Wrench size={13} />;
    case "confirmation":
      return <ShieldCheck size={13} />;
    case "unsupported":
      return <CircleHelp size={13} />;
  }
}
function kindClass(kind: TrajectoryEventKind): string {
  switch (kind) {
    case "system":
      return css.system ?? "";
    case "context":
      return css.context ?? "";
    case "user":
      return css.user ?? "";
    case "assistant":
      return css.assistant ?? "";
    case "tool":
      return css.tool ?? "";
    case "confirmation":
      return css.confirmation ?? "";
    case "unsupported":
      return css.systemNeutral ?? "";
  }
}
