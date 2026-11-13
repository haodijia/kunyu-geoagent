import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type {
  ModelProtocol,
  ModelReasoningSettings,
  ReasoningLevel,
} from "@/features/settings/models/api";
import { zhCN } from "@/locales/zh-CN";
import { computed, defineComponent } from "vue";
const content = zhCN.modelConnections.reasoning;
const levels: readonly ReasoningLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "on",
];
const switches = new Set(["thinking", "kimi", "zai"]);
export function validReasoningSettings(
  value: ModelReasoningSettings | null,
): boolean {
  if (value === null) return true;
  const entries = Object.entries(value.levels);
  if (value.mode === "none")
    return entries.length === 0 && value.default_level === null;
  if (
    entries.length === 0 ||
    (value.default_level !== null && !(value.default_level in value.levels))
  )
    return false;
  return entries.every(([level, wire]) => {
    if (wire === null) return value.mode === "effort" && level === "off";
    if (
      typeof wire !== "string" ||
      !wire ||
      wire !== wire.trim() ||
      wire.length > 64
    )
      return false;
    if (switches.has(value.mode))
      return (
        ["off", "on"].includes(level) &&
        wire === (level === "off" ? "disabled" : "enabled")
      );
    if (value.mode === "deepseek")
      return level === "off"
        ? wire === "disabled"
        : ["low", "high", "max"].includes(wire);
    return true;
  });
}
export const ReasoningSettings = defineComponent(
  (
    componentProps: {
      readonly value: ModelReasoningSettings | null;
      readonly protocol: ModelProtocol;
      readonly disabled: boolean;
      readonly onChange: (value: ModelReasoningSettings | null) => void;
    },
    { slots: _slots },
  ) => {
    const value = computed(() => componentProps.value),
      protocol = computed(() => componentProps.protocol),
      disabled = computed(() => componentProps.disabled),
      onChange = computed(() => componentProps.onChange);
    const modes = computed(() =>
      protocol.value === "openai_responses"
        ? (["none", "effort"] as const)
        : protocol.value === "deepseek_messages"
          ? (["none", "deepseek"] as const)
          : ([
              "none",
              "effort",
              "thinking",
              "deepseek",
              "kimi",
              "zai",
            ] as const),
    );
    const offered = computed(() =>
      value.value === null || value.value.mode === "none"
        ? []
        : switches.has(value.value.mode)
          ? levels.filter((level) => level === "off" || level === "on")
          : value.value.mode === "deepseek"
            ? levels.filter((level) =>
                ["off", "low", "high", "max"].includes(level),
              )
            : levels.filter((level) => level !== "on"),
    );
    function selectMode(mode: string) {
      if (mode === "inherit") {
        onChange.value(null);
        return;
      }
      const selected = mode as ModelReasoningSettings["mode"];
      onChange.value({
        mode: selected,
        levels: switches.has(selected)
          ? {
              on: "enabled",
            }
          : selected === "deepseek"
            ? {
                high: "high",
              }
            : {},
        default_level: switches.has(selected)
          ? "on"
          : selected === "deepseek"
            ? "high"
            : null,
      });
    }
    function toggle(level: ReasoningLevel, checked: boolean) {
      if (value.value === null)
        throw new Error("Thinking controls are not configured.");
      const updated = {
        ...value.value.levels,
      };
      if (checked)
        updated[level] = switches.has(value.value.mode)
          ? level === "off"
            ? "disabled"
            : "enabled"
          : value.value.mode === "deepseek" && level === "off"
            ? "disabled"
            : level === "off"
              ? "none"
              : level;
      else delete updated[level];
      onChange.value({
        ...value.value,
        levels: updated,
        default_level:
          !checked && value.value.default_level === level
            ? null
            : value.value.default_level,
      });
    }
    return () => {
      const _value = value.value,
        _disabled = disabled.value,
        _modes = modes.value,
        _offered = offered.value,
        _onChange = onChange.value;
      return (
        <div class="space-y-3" data-model-reasoning>
          <label class="provider-form-field">
            <span>{content.control}</span>
            <select
              aria-label={content.control}
              value={_value?.mode ?? "inherit"}
              disabled={_disabled}
              onChange={(event) =>
                selectMode((event.target as HTMLInputElement).value)
              }
            >
              <option value="inherit">{content.inherit}</option>
              {_modes.map((mode) => (
                <option key={mode} value={mode}>
                  {content.modes[mode]}
                </option>
              ))}
            </select>
          </label>
          {_value !== null && _value.mode !== "none" && (
            <>
              <div
                class="flex flex-wrap gap-x-4 gap-y-2"
                aria-label={content.levels}
              >
                {_offered.map((level) => (
                  <label key={level} class="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      aria-label={zhCN.conversation.reasoningValue(level)}
                      checked={level in _value.levels}
                      disabled={_disabled}
                      onUpdate:modelValue={(checked) =>
                        toggle(level, checked === true)
                      }
                    />
                    {zhCN.conversation.reasoningValue(level)}
                  </label>
                ))}
              </div>
              {!switches.has(_value.mode) && (
                <details class="text-xs">
                  <summary class="cursor-pointer text-muted-foreground">
                    {content.mapping}
                  </summary>
                  <div class="mt-2 grid gap-2 sm:grid-cols-2">
                    {_offered
                      .filter((level) => level in _value.levels)
                      .map((level) => (
                        <label key={level} class="provider-form-field">
                          <span>
                            {content.requestValue(
                              zhCN.conversation.reasoningValue(level),
                            )}
                          </span>
                          <Input
                            aria-label={content.requestValue(
                              zhCN.conversation.reasoningValue(level),
                            )}
                            value={_value.levels[level] ?? ""}
                            maxlength={64}
                            disabled={_disabled}
                            onInput={(event) =>
                              _onChange({
                                ..._value,
                                levels: {
                                  ..._value.levels,
                                  [level]:
                                    (event.target as HTMLInputElement).value ===
                                      "" && level === "off"
                                      ? null
                                      : (event.target as HTMLInputElement)
                                          .value,
                                },
                              })
                            }
                          />
                        </label>
                      ))}
                  </div>
                </details>
              )}
              <label class="provider-form-field">
                <span>{content.defaultLevel}</span>
                <select
                  aria-label={content.defaultLevel}
                  value={_value.default_level ?? ""}
                  disabled={_disabled}
                  onChange={(event) =>
                    _onChange({
                      ..._value,
                      default_level:
                        (event.target as HTMLInputElement).value === ""
                          ? null
                          : ((event.target as HTMLInputElement)
                              .value as ReasoningLevel),
                    })
                  }
                >
                  <option value="">
                    {zhCN.conversation.reasoningNotSpecified}
                  </option>
                  {_offered
                    .filter((level) => level in _value.levels)
                    .map((level) => (
                      <option key={level} value={level}>
                        {zhCN.conversation.reasoningValue(level)}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          <p class="text-xs leading-5 text-muted-foreground">{content.help}</p>
          {!validReasoningSettings(_value) && (
            <p role="alert" class="text-xs text-destructive">
              {content.invalid}
            </p>
          )}
        </div>
      );
    };
  },
  {
    name: "ReasoningSettings",
    inheritAttrs: false,
    props: ["value", "protocol", "disabled", "onChange"],
  },
);
