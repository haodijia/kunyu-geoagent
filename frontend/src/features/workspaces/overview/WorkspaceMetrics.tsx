import {
  Activity,
  ArrowUpRight,
  Bot,
  ChartNoAxesColumnIncreasing,
} from "lucide-react";
import type { WorkspaceMetrics as Metrics } from "./overview-api";
import { overviewCopy as copy } from "@/locales/zh-CN/workspace-overview";

const number = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export function WorkspaceMetrics({ metrics }: { readonly metrics: Metrics }) {
  const max = Math.max(1, ...metrics.activity.map((day) => day.runs));
  const states = [
    {
      name: copy.completed,
      value: metrics.completed,
      color: "var(--overview-accent)",
    },
    { name: copy.active, value: metrics.active, color: "#5a9c94" },
    { name: copy.failed, value: metrics.failed, color: "#cb8476" },
    { name: copy.cancelled, value: metrics.cancelled, color: "#a4a6b4" },
  ];
  return (
    <section
      className="overview-panel overview-metrics"
      aria-label={copy.metrics}
    >
      <header className="overview-panel-heading">
        <span className="overview-icon">
          <Activity />
        </span>
        <div>
          <h2>{copy.metrics}</h2>
          <p>{copy.metricsHint}</p>
        </div>
        <span className="overview-caption ml-auto">
          {metrics.sessions} {copy.sessions}
        </span>
      </header>
      <div className="overview-metrics-body">
        <div className="overview-kpis">
          {[
            {
              label: copy.runs,
              value: number.format(metrics.runs),
              Icon: Bot,
              hint: copy.stateHint,
            },
            {
              label: copy.tools,
              value: number.format(metrics.tool_calls),
              Icon: ArrowUpRight,
              hint: `${metrics.model_calls.toLocaleString()} ${copy.calls}`,
            },
            {
              label: copy.tokens,
              value:
                metrics.total_tokens === null
                  ? "—"
                  : number.format(metrics.total_tokens),
              Icon: ChartNoAxesColumnIncreasing,
              hint: copy.tokenHint(metrics.token_reported_runs, metrics.runs),
            },
          ].map(({ label, value, Icon, hint }) => (
            <div className="overview-kpi" key={label} title={hint}>
              <div>
                <span>{label}</span>
                <Icon />
              </div>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <div className="overview-activity">
          <div className="overview-chart">
            <div className="overview-chart-heading">
              <span>{copy.activity}</span>
              <span title={copy.activityZone}>UTC</span>
            </div>
            <div
              className="overview-bars"
              role="img"
              aria-label={metrics.activity
                .map((day) => `${day.day}: ${day.runs}`)
                .join("; ")}
            >
              {metrics.activity.map((day) => (
                <div
                  className="overview-bar-column"
                  key={day.day}
                  title={`${day.day} · ${day.runs} ${copy.runs} · ${day.completed} ${copy.completed}`}
                >
                  <span className="overview-bar-value">
                    {day.runs > 0 ? day.runs : ""}
                  </span>
                  <div className="overview-bar-track">
                    <div style={{ height: `${(day.runs / max) * 100}%` }} />
                  </div>
                  <span>{day.day.slice(5).replace("-", "/")}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="overview-status">
            <span className="overview-caption">{copy.stateHint}</span>
            <div className="overview-status-line">
              {states.map((state) => (
                <span
                  key={state.name}
                  style={{ flex: state.value, background: state.color }}
                />
              ))}
            </div>
            {states.map((state) => (
              <div className="overview-status-row" key={state.name}>
                <span>
                  <i style={{ background: state.color }} />
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
}
