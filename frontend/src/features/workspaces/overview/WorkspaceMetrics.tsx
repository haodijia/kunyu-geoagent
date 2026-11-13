import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";
import {
  Activity,
  ArrowUpRight,
  Bot,
  ChartNoAxesColumnIncreasing,
} from "lucide-vue-next";
import { computed, defineComponent } from "vue";
import type { WorkspaceMetrics as Metrics } from "./overview-api";
const number = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export const WorkspaceMetrics = defineComponent(
  (
    componentProps: {
      readonly metrics: Metrics;
    },
    { slots: _slots },
  ) => {
    const metrics = computed(() => componentProps.metrics);
    const max = computed(() =>
      Math.max(1, ...metrics.value.activity.map((day) => day.runs)),
    );
    const states = computed(() => [
      {
        name: copy.completed,
        value: metrics.value.completed,
        color: "var(--overview-accent)",
      },
      {
        name: copy.active,
        value: metrics.value.active,
        color: "#5a9c94",
      },
      {
        name: copy.failed,
        value: metrics.value.failed,
        color: "#cb8476",
      },
      {
        name: copy.cancelled,
        value: metrics.value.cancelled,
        color: "#a4a6b4",
      },
    ]);
    return () => {
      const _metrics = metrics.value,
        _max = max.value,
        _states = states.value;
      return (
        <section
          class="overview-panel overview-metrics"
          aria-label={copy.metrics}
        >
          <header class="overview-panel-heading">
            <span class="overview-icon">
              <Activity />
            </span>
            <div>
              <h2>{copy.metrics}</h2>
              <p>{copy.metricsHint}</p>
            </div>
            <span class="overview-caption ml-auto">
              {_metrics.sessions} {copy.sessions}
            </span>
          </header>
          <div class="overview-metrics-body">
            <div class="overview-kpis">
              {[
                {
                  label: copy.runs,
                  value: number.format(_metrics.runs),
                  Icon: Bot,
                  hint: copy.stateHint,
                },
                {
                  label: copy.tools,
                  value: number.format(_metrics.tool_calls),
                  Icon: ArrowUpRight,
                  hint: `${_metrics.model_calls.toLocaleString()} ${copy.calls}`,
                },
                {
                  label: copy.tokens,
                  value:
                    _metrics.total_tokens === null
                      ? "—"
                      : number.format(_metrics.total_tokens),
                  Icon: ChartNoAxesColumnIncreasing,
                  hint: copy.tokenHint(
                    _metrics.token_reported_runs,
                    _metrics.runs,
                  ),
                },
              ].map(({ label, value, Icon, hint }) => (
                <div class="overview-kpi" key={label} title={hint}>
                  <div>
                    <span>{label}</span>
                    <Icon />
                  </div>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div class="overview-activity">
              <div class="overview-chart">
                <div class="overview-chart-heading">
                  <span>{copy.activity}</span>
                  <span title={copy.activityZone}>UTC</span>
                </div>
                <div
                  class="overview-bars"
                  role="img"
                  aria-label={_metrics.activity
                    .map((day) => `${day.day}: ${day.runs}`)
                    .join("; ")}
                >
                  {_metrics.activity.map((day) => (
                    <div
                      class="overview-bar-column"
                      key={day.day}
                      title={`${day.day} · ${day.runs} ${copy.runs} · ${day.completed} ${copy.completed}`}
                    >
                      <span class="overview-bar-value">
                        {day.runs > 0 ? day.runs : ""}
                      </span>
                      <div class="overview-bar-track">
                        <div
                          style={{
                            height: `${(day.runs / _max) * 100}%`,
                          }}
                        />
                      </div>
                      <span>{day.day.slice(5).replace("-", "/")}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div class="overview-status">
                <span class="overview-caption">{copy.stateHint}</span>
                <div class="overview-status-line">
                  {_states.map((state) => (
                    <span
                      key={state.name}
                      style={{
                        flex: state.value,
                        background: state.color,
                      }}
                    />
                  ))}
                </div>
                {_states.map((state) => (
                  <div class="overview-status-row" key={state.name}>
                    <span>
                      <i
                        style={{
                          background: state.color,
                        }}
                      />
                      {state.name}
                    </span>
                    <strong>{state.value.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      );
    };
  },
  {
    name: "WorkspaceMetrics",
    inheritAttrs: false,
    props: ["metrics"],
  },
);
