import { useId, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { kindLabel } from "./TrajectoryLedger";
import { formatDurationMillis, type TrajectoryRecord } from "./trajectory-model";
import { trajectoryTranslate as t } from "./trajectory-locales";
import { zhCN } from "@/locales/zh-CN";
import css from "./TrajectoryInspector.module.css";
import ledger from "./TrajectoryLedger.module.css";

const content = zhCN.trajectory;
type Tab = "summary" | "preview" | "input" | "output" | "raw" | "source";
interface Props { record: TrajectoryRecord; onClose: () => void }

export function TrajectoryInspector({ record, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("summary");
  const [width, setWidth] = useState<number | null>(null);
  const aside = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const id = useId();
  const visibleTabs: readonly Tab[] = [
    "summary",
    ...(record.kind === "system" || record.kind === "context" || record.kind === "user" || record.kind === "assistant" ? ["preview" as const] : []),
    ...(record.input !== null && record.kind !== "user" ? ["input" as const] : []),
    ...(record.output !== null ? ["output" as const] : []),
    "raw",
    "source"
  ];

  function resize(next: number) {
    const parentWidth = aside.current?.parentElement?.clientWidth;
    if (parentWidth === undefined) return;
    setWidth(Math.max(320, Math.min(720, parentWidth - 280, next)));
  }

  const label = kindLabel(record.kind);
  const previewText = record.kind === "system" && record.input !== null && typeof record.input === "object"
    ? String((record.input as Record<string, unknown>).system_prompt ?? "")
    : record.kind === "context" && typeof record.input === "string"
      ? record.input
      : record.text;
  const preview = record.kind === "unsupported"
    ? <p>{content.unsupportedDescription}</p>
    : <div className="[overflow-wrap:anywhere] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3"><Markdown remarkPlugins={[remarkGfm]}>{previewText}</Markdown></div>;
  return (
    <aside ref={aside} className={css.details} aria-label={content.details}
      style={width === null ? undefined : { width }} onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
      <div className={css.detailsResizeHandle} role="separator" tabIndex={0}
        aria-label={content.resizeDetails} aria-orientation="vertical" aria-valuemin={320} aria-valuemax={720}
        aria-valuenow={width === null ? 380 : width}
        onDoubleClick={() => setWidth(null)}
        onPointerDown={event => {
          if (aside.current === null) return;
          drag.current = { x: event.clientX, width: aside.current.getBoundingClientRect().width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (drag.current !== null) resize(drag.current.width + drag.current.x - event.clientX);
        }}
        onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            if (aside.current !== null) resize(aside.current.clientWidth + (event.key === "ArrowLeft" ? 16 : -16));
          }
        }}
      />
      <header className={css.detailsHeader}>
        <div className={css.detailsTitle}>
          <span className={`${ledger.kindTag} ${kindClass(record)}`}>{label}</span>
          <span className={css.detailsLocation}>
            {record.turn === null ? `#${record.index}` : `${content.turnPrefix} ${record.turn} ${content.turnSuffix} · #${record.index}`}
          </span>
        </div>
        <button type="button" className={css.close} aria-label={content.closeDetails} onClick={onClose}><span aria-hidden="true">×</span></button>
      </header>
      <div className={css.detailTabs} role="tablist" aria-label={content.details}>
        {visibleTabs.map((item, index) => (
          <button key={item} type="button" role="tab" id={`${id}-${item}`}
            aria-controls={`${id}-panel`} aria-selected={tab === item} tabIndex={tab === item ? 0 : -1}
            className={`${css.detailTab} ${tab === item ? css.detailTabActive : ""}`}
            onClick={() => setTab(item)}
            onKeyDown={event => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              const next = visibleTabs[(index + (event.key === "ArrowRight" ? 1 : visibleTabs.length - 1)) % visibleTabs.length];
              if (next !== undefined) {
                event.preventDefault(); setTab(next);
                document.getElementById(`${id}-${next}`)?.focus();
              }
            }}>{tabLabel(item)}</button>
        ))}
      </div>
      <div className={`${css.detailBody} ${tab === "summary" ? css.detailBodySummary : ""}`} role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        {tab === "summary" && <Summary record={record} onOpen={setTab} preview={preview} />}
        {tab === "preview" && <div className={css.markdownPayload}>{preview}</div>}
        {tab === "input" && <JsonPayload value={record.input} />}
        {tab === "output" && <JsonPayload value={record.output} />}
        {tab === "raw" && <JsonPayload value={record.raw} />}
        {tab === "source" && <JsonPayload value={record.source} />}
      </div>
    </aside>
  );
}

function Summary({ record, onOpen, preview }: {
  readonly record: TrajectoryRecord;
  readonly onOpen: (tab: Tab) => void;
  readonly preview: ReactNode;
}) {
  const statusLabels = content.statuses as Readonly<Record<string, string>>;
  return <>
    <dl className={css.overview}>
      <div><dt>{content.status}</dt><dd>{statusLabels[record.status] ?? record.status}</dd></div>
      <div><dt>{content.startedAt}</dt><dd>{formatTime(record.occurredAt)}</dd></div>
      <div><dt>{content.completedAt}</dt><dd>{record.completedAt === null ? "—" : formatTime(record.completedAt)}</dd></div>
      <div><dt>{content.duration}</dt><dd>{formatDurationMillis(record.durationMillis, t)}</dd></div>
      {record.kind === "assistant" && <>
        <div><dt>{content.inputTokens}</dt><dd>{record.usage?.inputTokens ?? "—"}</dd></div>
        <div><dt>{content.outputTokens}</dt><dd>{record.usage?.outputTokens ?? "—"}</dd></div>
        <div><dt>{content.totalTokens}</dt><dd>{record.usage?.totalTokens ?? "—"}</dd></div>
      </>}
      <div><dt>{content.source}</dt><dd><button type="button" className="inline-flex items-center gap-1" onClick={() => onOpen("source")}>{content.identifiers}<ChevronRight size={11} className="text-muted-foreground" /></button></dd></div>
    </dl>
    <div className={css.overviewSections}>
      {(record.kind === "system" || record.kind === "context" || record.kind === "user" || record.kind === "assistant") && <DetailSection label={record.kind === "system" ? content.prompt : content.preview} onOpen={() => onOpen("preview")}>{preview}</DetailSection>}
      {record.input !== null && record.kind !== "user" && <DetailSection label={content.input} onOpen={() => onOpen("input")}><CompactJson value={record.input} /></DetailSection>}
      {record.output !== null && <DetailSection label={content.output} onOpen={() => onOpen("output")}><CompactJson value={record.output} /></DetailSection>}
    </div>
  </>;
}

function DetailSection({ children, label, onOpen }: { readonly children: ReactNode; readonly label: string; readonly onOpen: () => void }) {
  return <section className={css.overviewSection}>
    <button type="button" className="flex w-full items-center gap-1 px-[14px] py-2 text-left text-xs text-muted-foreground hover:text-foreground" onClick={onOpen}>
      {label}<ChevronRight size={12} />
    </button>
    <div className={css.markdownPreview}>{children}</div>
  </section>;
}

function CompactJson({ value }: { readonly value: unknown }) {
  return <pre className="m-0 max-h-40 overflow-hidden whitespace-pre-wrap font-mono text-xs leading-5 [overflow-wrap:anywhere]">{formatJson(value)}</pre>;
}

function JsonPayload({ value }: { readonly value: unknown }) {
  return <div className={css.sourceBlocks}><section className={css.sourceBlock}>
    <pre className={css.sourceBlockContent}>{formatJson(value)}</pre>
  </section></div>;
}

function formatJson(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3
  });
}

function tabLabel(tab: Tab): string {
  switch (tab) {
    case "summary": return content.summary;
    case "preview": return content.preview;
    case "input": return content.input;
    case "output": return content.output;
    case "raw": return content.raw;
    case "source": return content.source;
  }
}

function kindClass(record: TrajectoryRecord): string {
  switch (record.kind) {
    case "system": return ledger.system ?? "";
    case "context": return ledger.context ?? "";
    case "user": return ledger.user ?? "";
    case "assistant": return ledger.assistant ?? "";
    case "tool": return ledger.tool ?? "";
    case "confirmation": return ledger.confirmation ?? "";
    case "unsupported": return ledger.systemNeutral ?? "";
  }
}
