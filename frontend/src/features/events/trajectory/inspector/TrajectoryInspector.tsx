import { TrajectoryPayload } from "@/features/events/trajectory/TrajectoryPayload";
import {
  StreamDetails,
  streamFor,
} from "@/features/events/trajectory/inspector/StreamDetails";
import { ToolResultPresentation } from "@/features/events/trajectory/inspector/ToolResultPresentation";
import css from "@/features/events/trajectory/inspector/TrajectoryInspector.module.css";
import type { Tab } from "@/features/events/trajectory/inspector/labels";
import {
  content,
  kindClass,
  tabLabel,
} from "@/features/events/trajectory/inspector/labels";
import {
  Preview,
  PromptChanges,
  Schema,
  Summary,
  Timing,
} from "@/features/events/trajectory/inspector/sections";
import { kindLabel } from "@/features/events/trajectory/labels";
import ledger from "@/features/events/trajectory/styles/TrajectoryLedger.module.css";
import type { TrajectoryRecord } from "@/features/events/trajectory/trajectory-model";
import { X } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";

interface Props {
  record: TrajectoryRecord;
  onClose: () => void;
  onWidthChange: (width: number) => void;
}

export function TrajectoryInspector({ record, onClose, onWidthChange }: Props) {
  const visibleTabs = tabsFor(record);
  const [tab, setTab] = useState<Tab>(visibleTabs[0]!);
  const [width, setWidth] = useState<number | null>(null);
  const aside = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const id = useId();
  useLayoutEffect(() => {
    const element = aside.current;
    if (element === null) return;
    const observer = new ResizeObserver(() =>
      onWidthChange(element.getBoundingClientRect().width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [onWidthChange]);
  function resize(next: number) {
    const parentWidth = aside.current?.parentElement?.clientWidth;
    if (parentWidth === undefined) return;
    const value = Math.max(300, Math.min(720, parentWidth - 280, next));
    setWidth(value);
    onWidthChange(value);
  }
  return (
    <aside
      ref={aside}
      className={css.details}
      aria-label={content.details}
      style={width === null ? undefined : { width }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        className={css.detailsResizeHandle}
        role="separator"
        tabIndex={0}
        aria-label={content.resizeDetails}
        aria-orientation="vertical"
        aria-valuemin={300}
        aria-valuemax={720}
        aria-valuenow={width ?? 440}
        onDoubleClick={() => {
          setWidth(null);
          onWidthChange(440);
        }}
        onPointerDown={(event) => {
          if (aside.current === null) return;
          drag.current = {
            x: event.clientX,
            width: aside.current.getBoundingClientRect().width,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current !== null)
            resize(drag.current.width + drag.current.x - event.clientX);
        }}
        onPointerUp={(event) => {
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            if (aside.current !== null)
              resize(
                aside.current.clientWidth +
                  (event.key === "ArrowLeft" ? 16 : -16),
              );
          }
        }}
      />
      <header className={css.detailsHeader}>
        <div className={css.detailsTitle}>
          <span className={`${ledger.kindTag} ${kindClass(record)}`}>
            {kindLabel(record.kind)}
          </span>
          <span className={css.detailsLocation}>
            {record.turn === null
              ? ""
              : `${content.turnPrefix} ${record.turn} ${content.turnSuffix}`}
            {record.step === undefined ? "" : ` · ${content.step(record.step)}`}
          </span>
        </div>
        <button
          type="button"
          className={css.close}
          aria-label={content.closeDetails}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </header>
      <div
        className={css.detailTabs}
        role="tablist"
        aria-label={content.details}
      >
        {visibleTabs.map((item, index) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`${id}-${item}`}
            aria-controls={`${id}-panel`}
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            className={`${css.detailTab} ${tab === item ? css.detailTabActive : ""}`}
            onClick={() => setTab(item)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                return;
              const next =
                visibleTabs[
                  (index +
                    (event.key === "ArrowRight" ? 1 : visibleTabs.length - 1)) %
                    visibleTabs.length
                ]!;
              event.preventDefault();
              setTab(next);
              document.getElementById(`${id}-${next}`)?.focus();
            }}
          >
            {tabLabel(item)}
          </button>
        ))}
      </div>
      <div
        className={css.detailBody}
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${tab}`}
      >
        {tab === "summary" && <Summary record={record} onOpen={setTab} />}
        {tab === "preview" && (
          <div className={css.markdownPayload}>
            <Preview record={record} />
          </div>
        )}
        {tab === "input" && <TrajectoryPayload value={record.input} tree />}
        {tab === "output" && (
          <>
            <ToolResultPresentation record={record} />
            <TrajectoryPayload value={record.output} tree />
          </>
        )}
        {tab === "raw" && <TrajectoryPayload value={record.raw} />}
        {tab === "source" && <TrajectoryPayload value={record.source} tree />}
        {tab === "systemPrompt" && (
          <TrajectoryPayload value={record.prompt!.system} />
        )}
        {tab === "toolDefinitions" && (
          <TrajectoryPayload value={record.prompt!.tools} tree />
        )}
        {tab === "model" && (
          <TrajectoryPayload value={record.prompt!.model} tree />
        )}
        {tab === "schema" && <Schema record={record} />}
        {tab === "timing" && <Timing record={record} />}
        {tab === "changes" && <PromptChanges record={record} />}
        {tab === "stream" && <StreamDetails record={record} />}
      </div>
    </aside>
  );
}

function tabsFor(record: TrajectoryRecord): readonly Tab[] {
  if (record.source.kind === "compaction")
    return [
      "summary",
      "input",
      "output",
      ...(streamFor(record) === null ? [] : ["stream" as const]),
      "systemPrompt",
      "toolDefinitions",
      "model",
      "raw",
      "source",
    ];
  if (record.kind === "system" && record.prompt !== undefined)
    return [
      ...(record.previousPrompt === undefined ? [] : ["changes" as const]),
      "systemPrompt",
      "toolDefinitions",
      "model",
    ];
  if (["context", "user", "assistant"].includes(record.kind))
    return [
      "summary",
      "preview",
      ...(streamFor(record) === null ? [] : ["stream" as const]),
      "raw",
      "source",
    ];
  return [
    "summary",
    ...(record.input === null ? [] : ["input" as const]),
    ...(record.output === null ? [] : ["output" as const]),
    "schema",
    "timing",
  ];
}
