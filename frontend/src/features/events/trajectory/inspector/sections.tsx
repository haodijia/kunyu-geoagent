import type { Tab } from "@/features/events/trajectory/inspector/labels";
import {
  content,
  formatTime,
  producerLabel,
  statusLabel,
  tabLabel,
} from "@/features/events/trajectory/inspector/labels";
import { ToolResultPresentation } from "@/features/events/trajectory/inspector/ToolResultPresentation";
import css from "@/features/events/trajectory/inspector/TrajectoryInspector.module.css";
import { trajectoryTranslate as t } from "@/features/events/trajectory/trajectory-locales";
import type { TrajectoryRecord } from "@/features/events/trajectory/trajectory-model";
import { formatDurationMillis } from "@/features/events/trajectory/trajectory-model";
import {
  payloadText,
  TrajectoryPayload,
} from "@/features/events/trajectory/TrajectoryPayload";
import { SubagentRecordLink } from "@/features/subagents/SubagentRecordLink";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Summary({
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
        {record.source.kind === "subagent" &&
          typeof record.source.child_id === "string" && (
            <div className="mb-3">
              <SubagentRecordLink childId={record.source.child_id} />
            </div>
          )}
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

export function Preview({ record }: { record: TrajectoryRecord }) {
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

export function Timing({ record }: { record: TrajectoryRecord }) {
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

export function Schema({ record }: { record: TrajectoryRecord }) {
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

export function PromptChanges({ record }: { record: TrajectoryRecord }) {
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
