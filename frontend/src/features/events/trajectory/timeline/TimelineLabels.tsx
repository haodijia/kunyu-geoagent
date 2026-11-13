import { Tooltip } from "@/components/ui/tooltip";
import css from "@/features/events/trajectory/timeline/TrajectoryTimeline.module.css";
import type { TrajectoryTranslate } from "@/features/events/trajectory/trajectory-locales";
import { computed, defineComponent } from "vue";
export const TIMELINE_TOOLTIP_DELAY_MS = 500;
export const LaneLabels = defineComponent(
  (
    componentProps: {
      t: TrajectoryTranslate;
    },
    { slots: _slots },
  ) => {
    const t = computed(() => componentProps.t);
    return () => {
      const _t = t.value;
      return (
        <div class={css.labels} aria-hidden="true">
          <span>{_t("column.input")}</span>
          <span>{_t("column.model")}</span>
          <span>{_t("column.tools")}</span>
        </div>
      );
    };
  },
  {
    name: "LaneLabels",
    inheritAttrs: false,
    props: ["t"],
  },
);
export const EarlierHistoryBoundary = defineComponent(
  (
    componentProps: {
      loading: boolean;
      onHover: () => void;
      onLoad: (() => void) | undefined;
      t: TrajectoryTranslate;
    },
    { slots: _slots },
  ) => {
    const loading = computed(() => componentProps.loading),
      onHover = computed(() => componentProps.onHover),
      onLoad = computed(() => componentProps.onLoad),
      t = computed(() => componentProps.t);
    return () => {
      const _loading = loading.value,
        _t2 = t.value,
        _onLoad = onLoad.value,
        _onHover = onHover.value;
      return (
        <Tooltip
          label={
            _loading
              ? _t2("history.loadingEarlier")
              : _t2("history.clickToLoadEarlier")
          }
          side="right"
          delayMs={TIMELINE_TOOLTIP_DELAY_MS}
        >
          <button
            type="button"
            class={css.earlierHistory}
            data-earlier-history
            data-loading={_loading || undefined}
            aria-label={
              _loading
                ? _t2("history.loadingEarlierAria")
                : _t2("history.loadEarlier")
            }
            aria-disabled={_loading || _onLoad === undefined}
            onClick={_onLoad}
            onPointerenter={(event) => {
              event.stopPropagation();
              _onHover();
            }}
            onPointermove={(event) => {
              event.stopPropagation();
            }}
            onPointerdown={(event) => {
              event.stopPropagation();
            }}
          >
            …
          </button>
        </Tooltip>
      );
    };
  },
  {
    name: "EarlierHistoryBoundary",
    inheritAttrs: false,
    props: ["loading", "onHover", "onLoad", "t"],
  },
);
