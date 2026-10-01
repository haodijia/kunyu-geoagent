import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  Braces,
  CircleHelp,
  Cpu,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
} from "lucide-react";
import type { TrajectoryEventKind } from "./projection";
import type { TrajectoryRecord } from "./trajectory-model";
import { zhCN } from "@/locales/zh-CN";
import css from "./TrajectoryLedger.module.css";

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

export function TrajectoryLedger({
  records,
  selectedIndex,
  focusedIndex,
  searchMatches,
  rangeMatches,
  onSelect,
  collapsedTurns,
  onToggleTurn,
}: Props) {
  const pane = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useLayoutEffect(() => {
    if (pane.current !== null && follow.current)
      pane.current.scrollTop = pane.current.scrollHeight;
  }, [records.length]);
  useEffect(() => {
    const index = focusedIndex;
    if (index === null) return;
    pane.current
      ?.querySelector<HTMLElement>(`[data-record-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  return (
    <div
      ref={pane}
      className={css.tablePane}
      onScroll={(event) => {
        const element = event.currentTarget;
        follow.current =
          element.scrollHeight - element.clientHeight - element.scrollTop <= 2;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onSelect(null);
      }}
    >
      <table
        className={css.table}
        data-scroll-ready="true"
        aria-label={content.ledgerLabel}
      >
        <colgroup>
          <col className={css.eventColumn} />
          <col className={css.contentColumn} />
          <col className={css.resultColumn} />
        </colgroup>
        <tbody>
          {records
            .filter((record) => record.requestOnly !== true)
            .map((record, position, visible) => {
              const selected = record.index === selectedIndex;
              const dimmed =
                (rangeMatches !== null && !rangeMatches.has(record.index)) ||
                (searchMatches !== null && !searchMatches.has(record.index));
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
                  tabIndex={0}
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
                  onClick={() => onSelect(record.index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(record.index);
                    }
                  }}
                >
                  <td className={css.event}>
                    {selected && (
                      <span className={css.selectionRail} aria-hidden="true" />
                    )}
                    {record.turn !== null && (
                      <span className={css.turnRail} aria-hidden="true" />
                    )}
                    {turnStart && (
                      <button
                        type="button"
                        className={`${css.turnLabel} ${selected ? css.turnLabelActive : ""}`}
                        aria-expanded={!collapsedTurns.has(record.turn!)}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleTurn(record.turn!);
                        }}
                      >
                        <span className={css.turnLabelFull}>
                          {content.turnPrefix} {record.turn}{" "}
                          {content.turnSuffix}
                        </span>
                        <span className={css.turnLabelCompact}>
                          #{record.turn}
                        </span>
                      </button>
                    )}
                    <div className={css.eventInner}>
                      <span className={css.kindSlot}>
                        <span
                          className={`${css.kindTag} ${kindClass(record.kind)}`}
                          title={label}
                        >
                          <span className={css.kindTagIcon}>
                            {kindIcon(record.kind)}
                          </span>
                          <span className={css.kindTagLabel}>{label}</span>
                        </span>
                      </span>
                    </div>
                  </td>
                  <td
                    className={css.content}
                    colSpan={record.kind === "tool" ? 1 : 2}
                  >
                    <span className={css.contentText} title={record.text}>
                      {record.text}
                    </span>
                  </td>
                  {record.kind === "tool" && (
                    <td className={css.result}>
                      <span className={css.contentText}>
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
}

export function kindLabel(kind: TrajectoryEventKind): string {
  switch (kind) {
    case "system":
      return content.system;
    case "context":
      return content.context;
    case "user":
      return content.user;
    case "assistant":
      return content.assistant;
    case "tool":
      return content.tool;
    case "confirmation":
      return content.confirmation;
    case "unsupported":
      return content.unsupported;
  }
}

function kindIcon(kind: TrajectoryEventKind): ReactNode {
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
