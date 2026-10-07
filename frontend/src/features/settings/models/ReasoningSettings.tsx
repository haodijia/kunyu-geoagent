import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { zhCN } from "@/locales/zh-CN";
import type { ModelProtocol, ModelReasoningSettings, ReasoningLevel } from "./api";

const content = zhCN.modelConnections.reasoning;
const levels: readonly ReasoningLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "on"];
const switches = new Set(["thinking", "kimi", "zai"]);

export function validReasoningSettings(value: ModelReasoningSettings | null): boolean {
  if (value === null) return true;
  const entries = Object.entries(value.levels);
  if (value.mode === "none") return entries.length === 0 && value.default_level === null;
  if (entries.length === 0 || (value.default_level !== null && !(value.default_level in value.levels))) return false;
  return entries.every(([level, wire]) => {
    if (wire === null) return value.mode === "effort" && level === "off";
    if (typeof wire !== "string" || !wire || wire !== wire.trim() || wire.length > 64) return false;
    if (switches.has(value.mode)) return ["off", "on"].includes(level) && wire === (level === "off" ? "disabled" : "enabled");
    if (value.mode === "deepseek") return level === "off" ? wire === "disabled" : ["low", "high", "max"].includes(wire);
    return true;
  });
}

export function ReasoningSettings({ value, protocol, disabled, onChange }: {
  readonly value: ModelReasoningSettings | null;
  readonly protocol: ModelProtocol;
  readonly disabled: boolean;
  readonly onChange: (value: ModelReasoningSettings | null) => void;
}) {
  const modes = protocol === "openai_responses" ? ["none", "effort"] as const
    : protocol === "deepseek_messages" ? ["none", "deepseek"] as const
    : ["none", "effort", "thinking", "deepseek", "kimi", "zai"] as const;
  const offered = value === null || value.mode === "none" ? []
    : switches.has(value.mode) ? levels.filter(level => level === "off" || level === "on")
    : value.mode === "deepseek" ? levels.filter(level => ["off", "low", "high", "max"].includes(level))
    : levels.filter(level => level !== "on");
  function selectMode(mode: string) {
    if (mode === "inherit") { onChange(null); return; }
    const selected = mode as ModelReasoningSettings["mode"];
    onChange({ mode: selected, levels: switches.has(selected) ? { on: "enabled" } : selected === "deepseek" ? { high: "high" } : {}, default_level: switches.has(selected) ? "on" : selected === "deepseek" ? "high" : null });
  }
  function toggle(level: ReasoningLevel, checked: boolean) {
    if (value === null) throw new Error("Thinking controls are not configured.");
    const updated = { ...value.levels };
    if (checked) updated[level] = switches.has(value.mode) ? level === "off" ? "disabled" : "enabled" : value.mode === "deepseek" && level === "off" ? "disabled" : level === "off" ? "none" : level;
    else delete updated[level];
    onChange({ ...value, levels: updated, default_level: !checked && value.default_level === level ? null : value.default_level });
  }
  return <div className="space-y-3" data-model-reasoning>
    <label className="provider-form-field"><span>{content.control}</span>
      <select aria-label={content.control} value={value?.mode ?? "inherit"} disabled={disabled} onChange={event => selectMode(event.target.value)}>
        <option value="inherit">{content.inherit}</option>
        {modes.map(mode => <option key={mode} value={mode}>{content.modes[mode]}</option>)}
      </select>
    </label>
    {value !== null && value.mode !== "none" && <>
      <div className="flex flex-wrap gap-x-4 gap-y-2" aria-label={content.levels}>
        {offered.map(level => <label key={level} className="flex items-center gap-1.5 text-xs">
          <Checkbox aria-label={zhCN.conversation.reasoningValue(level)} checked={level in value.levels} disabled={disabled} onCheckedChange={checked => toggle(level, checked === true)} />
          {zhCN.conversation.reasoningValue(level)}
        </label>)}
      </div>
      {!switches.has(value.mode) && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">{content.mapping}</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">
        {offered.filter(level => level in value.levels).map(level => <label key={level} className="provider-form-field"><span>{content.requestValue(zhCN.conversation.reasoningValue(level))}</span>
          <Input aria-label={content.requestValue(zhCN.conversation.reasoningValue(level))} value={value.levels[level] ?? ""} maxLength={64} disabled={disabled}
            onChange={event => onChange({ ...value, levels: { ...value.levels, [level]: event.target.value === "" && level === "off" ? null : event.target.value } })} />
        </label>)}
      </div></details>}
      <label className="provider-form-field"><span>{content.defaultLevel}</span>
        <select aria-label={content.defaultLevel} value={value.default_level ?? ""} disabled={disabled} onChange={event => onChange({ ...value, default_level: event.target.value === "" ? null : event.target.value as ReasoningLevel })}>
          <option value="">{zhCN.conversation.reasoningNotSpecified}</option>
          {offered.filter(level => level in value.levels).map(level => <option key={level} value={level}>{zhCN.conversation.reasoningValue(level)}</option>)}
        </select>
      </label>
    </>}
    <p className="text-xs leading-5 text-muted-foreground">{content.help}</p>
    {!validReasoningSettings(value) && <p role="alert" className="text-xs text-destructive">{content.invalid}</p>}
  </div>;
}
