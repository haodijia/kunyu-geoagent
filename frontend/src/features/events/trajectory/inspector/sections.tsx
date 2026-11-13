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
import { MessageMarkdown } from "@/features/messages/rendering/MessageMarkdown";
import { SubagentRecordLink } from "@/features/subagents/SubagentRecordLink";
import { ChevronRight } from "lucide-vue-next";
import { computed, defineComponent, type VNodeChild } from "vue";
export const Summary = defineComponent(
  (
    componentProps: {
      record: TrajectoryRecord;
      onOpen: (tab: Tab) => void;
    },
    { slots: _slots },
  ) => {
    const record = computed(() => componentProps.record),
      onOpen = computed(() => componentProps.onOpen);
    const tool = computed(
      () =>
        record.value.kind === "tool" || record.value.kind === "confirmation",
    );
    const schema = computed(
      () => record.value.schema as Record<string, unknown> | undefined,
    );
    return () => {
      const _record = record.value,
        _tool = tool.value,
        _schema = schema.value,
        _onOpen = onOpen.value;
      return (
        <>
          <div class={css.summaryText}>
            {_record.source.kind === "subagent" &&
              typeof _record.source.child_id === "string" && (
                <div class="mb-3">
                  <SubagentRecordLink childId={_record.source.child_id} />
                </div>
              )}
            {_tool ? (
              String(_schema?.description ?? _record.source.tool_name)
            ) : (
              <Preview record={_record} />
            )}
          </div>
          <dl class={css.overview}>
            {_tool && (
              <div>
                <dt>{content.layer}</dt>
                <dd>{content.assistantLayer}</dd>
              </div>
            )}
            <div>
              <dt>{content.status}</dt>
              <dd>{statusLabel(_record.status)}</dd>
            </div>
            {_record.kind === "context" && (
              <div>
                <dt>{content.source}</dt>
                <dd>{producerLabel(_record.source.producer)}</dd>
              </div>
            )}
            {_record.kind === "assistant" && (
              <>
                <div>
                  <dt>{content.inputTokens}</dt>
                  <dd>{_record.usage?.inputTokens ?? "—"}</dd>
                </div>
                <div>
                  <dt>{content.outputTokens}</dt>
                  <dd>{_record.usage?.outputTokens ?? "—"}</dd>
                </div>
                <div>
                  <dt>{content.totalTokens}</dt>
                  <dd>{_record.usage?.totalTokens ?? "—"}</dd>
                </div>
              </>
            )}
          </dl>
          {_tool && (
            <>
              <DetailSection
                label={content.payload}
                onOpen={() => _onOpen("input")}
              >
                <TrajectoryPayload value={_record.input} tree />
              </DetailSection>
              {_record.output !== null && (
                <DetailSection
                  label={content.result}
                  onOpen={() => _onOpen("output")}
                >
                  <ToolResultPresentation record={_record} />
                  <TrajectoryPayload value={_record.output} tree />
                </DetailSection>
              )}
            </>
          )}
          <DetailSection
            label={content.timing}
            onOpen={_tool ? () => _onOpen("timing") : undefined}
          >
            <Timing record={_record} />
          </DetailSection>
        </>
      );
    };
  },
  {
    name: "Summary",
    inheritAttrs: false,
    props: ["record", "onOpen"],
  },
);
export const Preview = defineComponent(
  (
    componentProps: {
      record: TrajectoryRecord;
    },
    { slots: _slots },
  ) => {
    const record = computed(() => componentProps.record);
    const text = computed(() =>
      record.value.kind === "context" || record.value.kind === "user"
        ? String(record.value.input)
        : record.value.text,
    );
    return () => {
      const _text = text.value;
      return (
        <div class={css.markdown}>
          <MessageMarkdown text={_text} />
        </div>
      );
    };
  },
  {
    name: "Preview",
    inheritAttrs: false,
    props: ["record"],
  },
);
export const Timing = defineComponent(
  (
    componentProps: {
      record: TrajectoryRecord;
    },
    { slots: _slots },
  ) => {
    const record = computed(() => componentProps.record);
    return () => {
      const _record2 = record.value;
      return (
        <dl class={css.overview}>
          <div>
            <dt>{content.startedAt}</dt>
            <dd>{formatTime(_record2.occurredAt)}</dd>
          </div>
          <div>
            <dt>{content.duration}</dt>
            <dd>{formatDurationMillis(_record2.durationMillis, t)}</dd>
          </div>
          {_record2.completedAt !== null && (
            <div>
              <dt>{content.completedAt}</dt>
              <dd>{formatTime(_record2.completedAt)}</dd>
            </div>
          )}
        </dl>
      );
    };
  },
  {
    name: "Timing",
    inheritAttrs: false,
    props: ["record"],
  },
);
export const Schema = defineComponent(
  (
    componentProps: {
      record: TrajectoryRecord;
    },
    { slots: _slots },
  ) => {
    const record = computed(() => componentProps.record);
    const schema = computed(
      () => record.value.schema as Record<string, unknown>,
    );
    return () => {
      const _record3 = record.value,
        _schema2 = schema.value;
      if (_record3.schema === undefined)
        return <p class={css.summaryText}>{content.noSchema}</p>;
      return (
        <>
          <div class={css.summaryText}>
            <strong>{String(_schema2.name)}</strong>
            <p>{String(_schema2.description)}</p>
          </div>
          <TrajectoryPayload value={_schema2.parameters} tree />
        </>
      );
    };
  },
  {
    name: "Schema",
    inheritAttrs: false,
    props: ["record"],
  },
);
const DetailSection = defineComponent(
  (
    componentProps: {
      children?: VNodeChild;
      label: string;
      onOpen?: () => void;
    },
    { slots },
  ) => {
    const children = () => slots.default?.(),
      label = computed(() => componentProps.label),
      onOpen = computed(() => componentProps.onOpen);
    return () => {
      const _onOpen2 = onOpen.value,
        _label = label.value;
      return (
        <section class={css.overviewSection}>
          <button
            type="button"
            class={css.sectionHeading}
            onClick={_onOpen2}
            disabled={_onOpen2 === undefined}
          >
            {_label}
            {_onOpen2 !== undefined && <ChevronRight size={11} />}
          </button>
          {children()}
        </section>
      );
    };
  },
  {
    name: "DetailSection",
    inheritAttrs: false,
    props: ["label", "onOpen"],
  },
);
export const PromptChanges = defineComponent(
  (
    componentProps: {
      record: TrajectoryRecord;
    },
    { slots: _slots },
  ) => {
    const record = computed(() => componentProps.record);
    const before = computed(() => record.value.previousPrompt!);
    const after = computed(() => record.value.prompt!);
    return () => {
      const _before = before.value,
        _after = after.value;
      return (
        <>
          {(["system", "tools", "model"] as const)
            .filter(
              (key) => payloadText(_before[key]) !== payloadText(_after[key]),
            )
            .map((key) => {
              const oldLines = payloadText(_before[key]).split("\n");
              const newLines = payloadText(_after[key]).split("\n");
              return (
                <section key={key}>
                  <h3 class={css.sectionHeading}>
                    {tabLabel(
                      key === "system"
                        ? "systemPrompt"
                        : key === "tools"
                          ? "toolDefinitions"
                          : "model",
                    )}
                  </h3>
                  <pre class={css.diff}>
                    {oldLines
                      .filter((line) => !newLines.includes(line))
                      .map((line, index) => (
                        <div class={css.diffRemoved} key={`old-${index}`}>
                          − {line}
                        </div>
                      ))}
                    {newLines.map((line, index) => (
                      <div
                        class={oldLines.includes(line) ? "" : css.diffAdded}
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
    };
  },
  {
    name: "PromptChanges",
    inheritAttrs: false,
    props: ["record"],
  },
);
