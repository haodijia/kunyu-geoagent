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
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { X } from "lucide-vue-next";
import { computed, defineComponent, shallowRef, useId } from "vue";
interface Props {
  record: TrajectoryRecord;
  onClose: () => void;
  onWidthChange: (width: number) => void;
}
export const TrajectoryInspector = defineComponent(
  (componentProps: Props, { slots: _slots }) => {
    const record = computed(() => componentProps.record),
      onClose = computed(() => componentProps.onClose),
      onWidthChange = computed(() => componentProps.onWidthChange);
    const visibleTabs = computed(() => tabsFor(record.value));
    const tab = shallowRef<Tab>(visibleTabs.value[0]!),
      setTab = refSetter(tab);
    const width = shallowRef<number | null>(null),
      setWidth = refSetter(width);
    const aside = shallowRef<HTMLElement | null>(null);
    const drag = shallowRef<{
      x: number;
      width: number;
    } | null>(null);
    const id = useId();
    watchMounted([() => onWidthChange.value], () => {
      const element = aside.value;
      if (element === null) return;
      const observer = new ResizeObserver(() =>
        onWidthChange.value(element.getBoundingClientRect().width),
      );
      observer.observe(element);
      return () => observer.disconnect();
    });
    function resize(next: number) {
      const parentWidth = aside.value?.parentElement?.clientWidth;
      if (parentWidth === undefined) return;
      const value = Math.max(300, Math.min(720, parentWidth - 280, next));
      setWidth(value);
      onWidthChange.value(value);
    }
    return () => {
      const _onClose = onClose.value,
        _onWidthChange = onWidthChange.value,
        _record = record.value,
        _visibleTabs = visibleTabs.value;
      return (
        <aside
          ref={aside}
          class={css.details}
          aria-label={content.details}
          style={
            width.value === null
              ? undefined
              : {
                  width: `${width.value}px`,
                }
          }
          onKeydown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              _onClose();
            }
          }}
        >
          <div
            class={css.detailsResizeHandle}
            role="separator"
            tabindex={0}
            aria-label={content.resizeDetails}
            aria-orientation="vertical"
            aria-valuemin={300}
            aria-valuemax={720}
            aria-valuenow={width.value ?? 440}
            onDblclick={() => {
              setWidth(null);
              _onWidthChange(440);
            }}
            onPointerdown={(event) => {
              if (aside.value === null) return;
              drag.value = {
                x: event.clientX,
                width: aside.value.getBoundingClientRect().width,
              };
              (event.currentTarget as HTMLElement).setPointerCapture(
                event.pointerId,
              );
            }}
            onPointermove={(event) => {
              if (drag.value !== null)
                resize(drag.value.width + drag.value.x - event.clientX);
            }}
            onPointerup={(event) => {
              drag.value = null;
              (event.currentTarget as HTMLElement).releasePointerCapture(
                event.pointerId,
              );
            }}
            onLostpointercapture={() => {
              drag.value = null;
            }}
            onKeydown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                if (aside.value !== null)
                  resize(
                    aside.value.clientWidth +
                      (event.key === "ArrowLeft" ? 16 : -16),
                  );
              }
            }}
          />
          <header class={css.detailsHeader}>
            <div class={css.detailsTitle}>
              <span class={`${ledger.kindTag} ${kindClass(_record)}`}>
                {kindLabel(_record.kind)}
              </span>
              <span class={css.detailsLocation}>
                {_record.turn === null
                  ? ""
                  : `${content.turnPrefix} ${_record.turn} ${content.turnSuffix}`}
                {_record.step === undefined
                  ? ""
                  : ` · ${content.step(_record.step)}`}
              </span>
            </div>
            <button
              type="button"
              class={css.close}
              aria-label={content.closeDetails}
              onClick={_onClose}
            >
              <X size={14} />
            </button>
          </header>
          <div
            class={css.detailTabs}
            role="tablist"
            aria-label={content.details}
          >
            {_visibleTabs.map((item, index) => (
              <button
                key={item}
                type="button"
                role="tab"
                id={`${id}-${item}`}
                aria-controls={`${id}-panel`}
                aria-selected={tab.value === item}
                tabindex={tab.value === item ? 0 : -1}
                class={`${css.detailTab} ${tab.value === item ? css.detailTabActive : ""}`}
                onClick={() => setTab(item)}
                onKeydown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                    return;
                  const next =
                    _visibleTabs[
                      (index +
                        (event.key === "ArrowRight"
                          ? 1
                          : _visibleTabs.length - 1)) %
                        _visibleTabs.length
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
            class={css.detailBody}
            role="tabpanel"
            id={`${id}-panel`}
            aria-labelledby={`${id}-${tab.value}`}
          >
            {tab.value === "summary" && (
              <Summary record={_record} onOpen={setTab} />
            )}
            {tab.value === "preview" && (
              <div class={css.markdownPayload}>
                <Preview record={_record} />
              </div>
            )}
            {tab.value === "input" && (
              <TrajectoryPayload value={_record.input} tree />
            )}
            {tab.value === "output" && (
              <>
                <ToolResultPresentation record={_record} />
                <TrajectoryPayload value={_record.output} tree />
              </>
            )}
            {tab.value === "raw" && <TrajectoryPayload value={_record.raw} />}
            {tab.value === "source" && (
              <TrajectoryPayload value={_record.source} tree />
            )}
            {tab.value === "systemPrompt" && (
              <TrajectoryPayload value={_record.prompt!.system} />
            )}
            {tab.value === "toolDefinitions" && (
              <TrajectoryPayload value={_record.prompt!.tools} tree />
            )}
            {tab.value === "model" && (
              <TrajectoryPayload value={_record.prompt!.model} tree />
            )}
            {tab.value === "schema" && <Schema record={_record} />}
            {tab.value === "timing" && <Timing record={_record} />}
            {tab.value === "changes" && <PromptChanges record={_record} />}
            {tab.value === "stream" && <StreamDetails record={_record} />}
          </div>
        </aside>
      );
    };
  },
  {
    name: "TrajectoryInspector",
    inheritAttrs: false,
    props: ["record", "onClose", "onWidthChange"],
  },
);
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
