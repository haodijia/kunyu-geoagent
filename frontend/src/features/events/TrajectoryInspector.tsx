import {
  useMemo,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronRight, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { kindLabel } from "./TrajectoryLedger";
import { TrajectoryPayload, payloadText } from "./TrajectoryPayload";
import {
  assistantStreamChunkCount,
  parseAssistantStream,
  parseStreamOrigin,
} from "./assistant-stream";
import {
  formatDurationMillis,
  type TrajectoryRecord,
} from "./trajectory-model";
import { trajectoryTranslate as t } from "./trajectory-locales";
import { zhCN } from "@/locales/zh-CN";
import css from "./TrajectoryInspector.module.css";
import ledger from "./TrajectoryLedger.module.css";
import { AttachmentStrip } from "@/features/attachments/AttachmentStrip";
import { collectImageOffloads } from "@/features/attachments/image-offloads";
import { parseToolContent, toolContentImages, toolContentText } from "@/features/agent/tool-content";
import { ReadResult } from "@/features/agent/ReadResult";
import { SearchResult } from "@/features/agent/SearchResult";
import { FileMutationResult } from "@/features/agent/FileMutationResult";
import { useSessionWorkspace } from "@/features/sessions/SessionWorkspaceContext";
import { useSessionEvents } from "./SessionEventContext";
const content = zhCN.trajectory;
type Tab =
  | "summary"
  | "preview"
  | "input"
  | "output"
  | "raw"
  | "source"
  | "systemPrompt"
  | "toolDefinitions"
  | "model"
  | "changes"
  | "schema"
  | "timing"
  | "stream";
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
        if (event.key === "Escape") onClose();
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
        {tab === "output" && <><ToolResultPresentation record={record} /><TrajectoryPayload value={record.output} tree /></>}
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
function streamFor(record: TrajectoryRecord) {
  if (
    record.kind !== "assistant" ||
    record.output === null ||
    typeof record.output !== "object"
  )
    return null;
  const output = record.output as { stream: unknown; stream_origin: unknown };
  if (output.stream === null) return null;
  return {
    records: parseAssistantStream(output.stream),
    origin: parseStreamOrigin(output.stream_origin),
  };
}
function StreamDetails({ record }: { record: TrajectoryRecord }) {
  const stream = streamFor(record);
  if (stream === null)
    throw new Error("Stream details require a settled assistant attempt.");
  return (
    <>
      <dl className={css.overview}>
        <div>
          <dt>{content.streamDetails.origin}</dt>
          <dd>
            {stream.origin === "model"
              ? content.streamDetails.model
              : content.streamDetails.buffered}
          </dd>
        </div>
        <div>
          <dt>{content.streamDetails.chunks}</dt>
          <dd>{assistantStreamChunkCount(stream.records)}</dd>
        </div>
        <div>
          <dt>{content.streamDetails.records}</dt>
          <dd>{stream.records.length}</dd>
        </div>
      </dl>
      {stream.origin === "buffered" && (
        <p className="mb-3 text-xs text-muted-foreground">
          {content.streamDetails.historicalTiming}
        </p>
      )}
      <TrajectoryPayload value={stream.records} tree />
    </>
  );
}
function Summary({
  record,
  onOpen,
}: {
  record: TrajectoryRecord;
  onOpen: (tab: Tab) => void;
}) {
  const tool = record.kind === "tool" || record.kind === "confirmation";
  const schema = record.schema as Record<string, unknown> | undefined;
  return (
    <>
      <div className={css.summaryText}>
        {tool ? (
          String(schema?.description ?? record.source.tool_name)
        ) : (
          <Preview record={record} />
        )}
      </div>
      <dl className={css.overview}>
        {tool && (
          <div>
            <dt>{content.layer}</dt>
            <dd>{content.assistantLayer}</dd>
          </div>
        )}
        <div>
          <dt>{content.status}</dt>
          <dd>{statusLabel(record.status)}</dd>
        </div>
        {record.kind === "context" && (
          <div>
            <dt>{content.source}</dt>
            <dd>{producerLabel(record.source.producer)}</dd>
          </div>
        )}
        {record.kind === "assistant" && (
          <>
            <div>
              <dt>{content.inputTokens}</dt>
              <dd>{record.usage?.inputTokens ?? "—"}</dd>
            </div>
            <div>
              <dt>{content.outputTokens}</dt>
              <dd>{record.usage?.outputTokens ?? "—"}</dd>
            </div>
            <div>
              <dt>{content.totalTokens}</dt>
              <dd>{record.usage?.totalTokens ?? "—"}</dd>
            </div>
          </>
        )}
      </dl>
      {tool && (
        <>
          <DetailSection label={content.payload} onOpen={() => onOpen("input")}>
            <TrajectoryPayload value={record.input} tree />
          </DetailSection>
          {record.output !== null && (
            <DetailSection
              label={content.result}
              onOpen={() => onOpen("output")}
            >
              <ToolResultPresentation record={record} />
              <TrajectoryPayload value={record.output} tree />
            </DetailSection>
          )}
        </>
      )}
      <DetailSection
        label={content.timing}
        onOpen={tool ? () => onOpen("timing") : undefined}
      >
        <Timing record={record} />
      </DetailSection>
    </>
  );
}
function ToolResultPresentation({ record }: { readonly record: TrajectoryRecord }) {
  const session = useSessionWorkspace();
  const { records } = useSessionEvents();
  const offloads = useMemo(() => collectImageOffloads(records), [records]);
  const output = record.output;
  if (record.kind !== "tool" || output === null || typeof output !== "object" || !("content" in output)) return null;
  if (record.source.tool_name === "read") {
    if (!("result" in output)) throw new Error("Read result has no presentation metadata.");
    return <ReadResult value={output.result} text={toolContentText(parseToolContent(output.content))} />;
  }
  if (record.source.tool_name === "write" || record.source.tool_name === "edit") {
    if (!("result" in output)) throw new Error("File mutation result has no presentation metadata.");
    return <FileMutationResult value={output.result} text={toolContentText(parseToolContent(output.content))} />;
  }
  if (record.source.tool_name === "glob" || record.source.tool_name === "grep") {
    if (!("result" in output)) throw new Error("Search result has no presentation metadata.");
    return <SearchResult value={output.result} text={toolContentText(parseToolContent(output.content))} />;
  }
  const images = toolContentImages(parseToolContent(output.content));
  if (images.length === 0) return null;
  const id = record.source.tool_call_id;
  if (typeof id !== "string") throw new Error("Tool image result has no source identity.");
  return <AttachmentStrip sessionId={session.id} attachments={images} offloadedIds={offloads.get(id)} />;
}
function Preview({ record }: { record: TrajectoryRecord }) {
  const text =
    record.kind === "context" || record.kind === "user"
      ? String(record.input)
      : record.text;
  return (
    <div className={css.markdown}>
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  );
}
function Timing({ record }: { record: TrajectoryRecord }) {
  return (
    <dl className={css.overview}>
      <div>
        <dt>{content.startedAt}</dt>
        <dd>{formatTime(record.occurredAt)}</dd>
      </div>
      <div>
        <dt>{content.duration}</dt>
        <dd>{formatDurationMillis(record.durationMillis, t)}</dd>
      </div>
      {record.completedAt !== null && (
        <div>
          <dt>{content.completedAt}</dt>
          <dd>{formatTime(record.completedAt)}</dd>
        </div>
      )}
    </dl>
  );
}
function Schema({ record }: { record: TrajectoryRecord }) {
  if (record.schema === undefined)
    return <p className={css.summaryText}>{content.noSchema}</p>;
  const schema = record.schema as Record<string, unknown>;
  return (
    <>
      <div className={css.summaryText}>
        <strong>{String(schema.name)}</strong>
        <p>{String(schema.description)}</p>
      </div>
      <TrajectoryPayload value={schema.parameters} tree />
    </>
  );
}
function DetailSection({
  children,
  label,
  onOpen,
}: {
  children: ReactNode;
  label: string;
  onOpen?: () => void;
}) {
  return (
    <section className={css.overviewSection}>
      <button
        type="button"
        className={css.sectionHeading}
        onClick={onOpen}
        disabled={onOpen === undefined}
      >
        {label}
        {onOpen !== undefined && <ChevronRight size={11} />}
      </button>
      {children}
    </section>
  );
}
function PromptChanges({ record }: { record: TrajectoryRecord }) {
  const before = record.previousPrompt!;
  const after = record.prompt!;
  return (
    <>
      {(["system", "tools", "model"] as const)
        .filter((key) => payloadText(before[key]) !== payloadText(after[key]))
        .map((key) => {
          const oldLines = payloadText(before[key]).split("\n");
          const newLines = payloadText(after[key]).split("\n");
          return (
            <section key={key}>
              <h3 className={css.sectionHeading}>
                {tabLabel(
                  key === "system"
                    ? "systemPrompt"
                    : key === "tools"
                      ? "toolDefinitions"
                      : "model",
                )}
              </h3>
              <pre className={css.diff}>
                {oldLines
                  .filter((line) => !newLines.includes(line))
                  .map((line, index) => (
                    <div className={css.diffRemoved} key={`old-${index}`}>
                      − {line}
                    </div>
                  ))}
                {newLines.map((line, index) => (
                  <div
                    className={oldLines.includes(line) ? "" : css.diffAdded}
                    key={`new-${index}`}
                  >
                    {oldLines.includes(line) ? "  " : "+ "}
                    {line}
                  </div>
                ))}
              </pre>
            </section>
          );
        })}
    </>
  );
}
function formatTime(value: string): string {
  return new Date(value).toLocaleString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}
function producerLabel(value: unknown): string {
  const labels = content.producers as Record<string, string>;
  return typeof value === "string" ? (labels[value] ?? value) : "—";
}
function statusLabel(value: string): string {
  return (content.statuses as Record<string, string>)[value] ?? value;
}
function tabLabel(tab: Tab): string {
  if (tab === "model") return zhCN.modelConnections.title;
  if (tab === "input") return content.payload;
  if (tab === "output") return content.result;
  return content[tab];
}
function kindClass(record: TrajectoryRecord): string {
  return ledger[record.kind === "unsupported" ? "systemNeutral" : record.kind]!;
}
