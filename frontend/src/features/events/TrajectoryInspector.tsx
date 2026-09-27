import { useId, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TrajectoryRecord } from "./trajectory-model";
import { zhCN } from "@/locales/zh-CN";
import css from "./TrajectoryInspector.module.css";
import ledger from "./TrajectoryLedger.module.css";

const content = zhCN.trajectory;
const tabs = ["summary", "preview", "raw", "source"] as const;
type Tab = typeof tabs[number];
interface Props { record: TrajectoryRecord; onClose: () => void }

export function TrajectoryInspector({ record, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("summary");
  const [width, setWidth] = useState<number | null>(null);
  const aside = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const id = useId();
  const visibleTabs = record.source === null ? tabs.filter(item => item !== "source") : tabs;

  function resize(next: number) {
    const parentWidth = aside.current?.parentElement?.clientWidth;
    if (parentWidth === undefined) return;
    setWidth(Math.max(320, Math.min(720, parentWidth - 280, next)));
  }

  const label = record.kind === "user" ? content.user : content.unsupported;
  const preview = record.kind === "user"
    ? <div className="[overflow-wrap:anywhere] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-slate-50 [&_pre]:p-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3"><Markdown remarkPlugins={[remarkGfm]}>{record.text}</Markdown></div>
    : <p>{content.unsupportedDescription}</p>;
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
          <span className={`${ledger.kindTag} ${record.kind === "user" ? ledger.user : ledger.systemNeutral}`}>{label}</span>
          {record.turn !== null && <span className={css.detailsLocation}>{content.turnPrefix} {record.turn} {content.turnSuffix} · {content.message}</span>}
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
            }}>{content[item]}</button>
        ))}
      </div>
      <div className={`${css.detailBody} ${tab === "summary" ? css.detailBodySummary : ""}`} role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
        {tab === "summary" && <>
          <dl className={css.overview}>
            {record.source !== null && <div><dt>{content.source}</dt><dd><button type="button" className="inline-flex items-center gap-1" onClick={() => setTab("source")}>{content.user}<ChevronRight size={11} className="text-[rgb(173,178,184)]" /></button></dd></div>}
            <div><dt>{content.status}</dt><dd>{record.kind === "user" ? content.completed : content.unsupported}</dd></div>
            <div><dt>{content.duration}</dt><dd>{record.kind === "user" ? content.instantDuration : "—"}</dd></div>
          </dl>
          <div className={css.overviewSections}>
            <section className={css.overviewSection}>
              <button type="button" className="flex w-full items-center gap-1 px-[14px] py-2 text-left text-xs text-[rgb(129,133,140)] hover:text-black" onClick={() => setTab("preview")}>
                {content.preview}<ChevronRight size={12} />
              </button>
              <div className={css.markdownPreview}>{preview}</div>
            </section>
          </div>
        </>}
        {tab === "preview" && <div className={css.markdownPayload}>{preview}</div>}
        {tab === "raw" && <div className={css.sourceBlocks}><section className={css.sourceBlock}>
          <div className={css.sourceBlockHeader}><span className={css.sourceBlockLabel}>{content.textBlock}</span></div>
          <pre className={css.sourceBlockContent}>{record.text}</pre>
        </section></div>}
        {tab === "source" && record.source !== null && <div className="p-[14px] font-mono text-xs leading-5"><details open><summary className="cursor-pointer text-[rgb(129,133,140)]">{content.source}</summary><pre className="m-0 whitespace-pre-wrap py-2">{JSON.stringify(record.source, null, 2)}</pre></details></div>}
      </div>
    </aside>
  );
}
