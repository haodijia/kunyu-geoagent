import { useEffect, useLayoutEffect, useRef } from "react";
import { CircleHelp } from "lucide-react";
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
}

export function TrajectoryLedger({ records, selectedIndex, focusedIndex, searchMatches, rangeMatches, onSelect }: Props) {
  const pane = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useLayoutEffect(() => {
    if (pane.current !== null && follow.current) pane.current.scrollTop = pane.current.scrollHeight;
  }, [records.length]);
  useEffect(() => {
    const index = focusedIndex;
    if (index === null) return;
    pane.current?.querySelector<HTMLElement>(`[data-record-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  return (
    <div ref={pane} className={css.tablePane}
      onScroll={event => {
        const element = event.currentTarget;
        follow.current = element.scrollHeight - element.clientHeight - element.scrollTop <= 2;
      }}
      onClick={event => { if (event.target === event.currentTarget) onSelect(null); }}
    >
      <table className={css.table} data-scroll-ready="true" aria-label={content.ledgerLabel}>
        <colgroup><col className={css.eventColumn} /><col className={css.contentColumn} /></colgroup>
        <tbody>
          {records.map(record => {
            const selected = record.index === selectedIndex;
            const dimmed = (rangeMatches !== null && !rangeMatches.has(record.index))
              || (searchMatches !== null && !searchMatches.has(record.index));
            const label = record.kind === "user" ? content.user : content.unsupported;
            return (
              <tr key={record.id} tabIndex={0} aria-selected={selected}
                aria-label={`${label}，${record.text}`}
                data-record-index={record.index} data-selected={selected || undefined}
                data-turn-start="true" data-turn-end="true"
                data-timeline-focus={dimmed ? "outside" : undefined}
                onClick={() => onSelect(record.index)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault(); onSelect(record.index);
                  }
                }}
              >
                <td className={css.event}>
                  {selected && <span className={css.selectionRail} aria-hidden="true" />}
                  {selected && <span className={css.turnRail} aria-hidden="true" />}
                  {record.turn !== null && (
                    <span className={`${css.turnLabel} ${selected ? css.turnLabelActive : ""}`}>
                      <span className={css.turnLabelFull}>{content.turnPrefix} {record.turn} {content.turnSuffix}</span>
                      <span className={css.turnLabelCompact}>#{record.turn}</span>
                    </span>
                  )}
                  <div className={css.eventInner}>
                    <span className={css.kindSlot}>
                      <span className={`${css.kindTag} ${record.kind === "user" ? css.user : css.systemNeutral}`} title={label}>
                        <span className={css.kindTagIcon}>{record.kind === "user" ? <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true"><path d="M8 8.5C9.65685 8.5 11 7.15685 11 5.5C11 3.84315 9.65685 2.5 8 2.5C6.34315 2.5 5 3.84315 5 5.5C5 7.15685 6.34315 8.5 8 8.5Z" /><path d="M1.5 14.5C1.5 11.25 4.25 10 8 10C11.75 10 14.5 11.25 14.5 14.5" /></svg> : <CircleHelp size={13} />}</span>
                        <span className={css.kindTagLabel}>{label}</span>
                      </span>
                    </span>
                  </div>
                </td>
                <td className={css.content}>
                  <span className={css.contentText} title={record.text}>
                    {record.kind === "user" ? record.text : content.unsupportedDescription}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
