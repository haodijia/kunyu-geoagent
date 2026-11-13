import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type {
  ModelCatalogEntry,
  ModelProtocol,
  ModelSettings as ModelSettingsInput,
} from "@/features/settings/models/api";
import { ModelExpandableRow } from "@/features/settings/models/ModelConnectionDetailControls";
import {
  ReasoningSettings,
  validReasoningSettings,
} from "@/features/settings/models/ReasoningSettings";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { computed, defineComponent, shallowRef } from "vue";
const content = zhCN.modelConnections.modelSettings;
export const ModelSettings = defineComponent(
  (
    componentProps: {
      readonly entries: readonly ModelCatalogEntry[];
      readonly protocol: ModelProtocol;
      readonly disabled: boolean;
      readonly onSave: (
        modelId: string,
        input: ModelSettingsInput,
      ) => Promise<boolean>;
    },
    { slots: _slots },
  ) => {
    const entries = computed(() => componentProps.entries),
      protocol = computed(() => componentProps.protocol),
      disabled = computed(() => componentProps.disabled),
      onSave = computed(() => componentProps.onSave);
    const editing = shallowRef<string | null>(null),
      setEditing = refSetter(editing);
    return () => {
      const _entries = entries.value,
        _protocol = protocol.value,
        _disabled = disabled.value,
        _onSave = onSave.value;
      return (
        <div class="space-y-2">
          <p class="text-xs leading-5 text-muted-foreground">{content.help}</p>
          {_entries.length === 0 && (
            <p class="text-xs text-muted-foreground">{content.noModels}</p>
          )}
          {_entries.map((entry) => (
            <ModelSettingsRow
              key={entry.model_id}
              entry={entry}
              protocol={_protocol}
              disabled={_disabled}
              editing={editing.value === entry.model_id}
              onEdit={() => setEditing(entry.model_id)}
              onCancel={() => setEditing(null)}
              onSave={async (input) => {
                const saved = await _onSave(entry.model_id, input);
                if (saved) setEditing(null);
                return saved;
              }}
            />
          ))}
        </div>
      );
    };
  },
  {
    name: "ModelSettings",
    inheritAttrs: false,
    props: ["entries", "protocol", "disabled", "onSave"],
  },
);
const ModelSettingsRow = defineComponent(
  (
    componentProps: {
      readonly entry: ModelCatalogEntry;
      readonly protocol: ModelProtocol;
      readonly disabled: boolean;
      readonly editing: boolean;
      readonly onEdit: () => void;
      readonly onCancel: () => void;
      readonly onSave: (input: ModelSettingsInput) => Promise<boolean>;
    },
    { slots: _slots },
  ) => {
    const entry = computed(() => componentProps.entry),
      protocol = computed(() => componentProps.protocol),
      disabled = computed(() => componentProps.disabled),
      editing = computed(() => componentProps.editing),
      onEdit = computed(() => componentProps.onEdit),
      onCancel = computed(() => componentProps.onCancel),
      onSave = computed(() => componentProps.onSave);
    const reasoning = shallowRef(entry.value.reasoning_settings),
      setReasoning = refSetter(reasoning);
    const saveFailed = shallowRef(false),
      setSaveFailed = refSetter(saveFailed);
    const windowTokens = shallowRef(
        entry.value.context_window === null
          ? ""
          : String(entry.value.context_window),
      ),
      setWindowTokens = refSetter(windowTokens);
    const retentionTokens = shallowRef(String(entry.value.retention_tokens)),
      setRetentionTokens = refSetter(retentionTokens);
    const outputTokens = shallowRef(String(entry.value.max_output_tokens)),
      setOutputTokens = refSetter(outputTokens);
    const enabled = shallowRef(entry.value.image_input.enabled),
      setEnabled = refSetter(enabled);
    const budget = shallowRef(
        entry.value.image_input.pixel_budget === null
          ? "default"
          : entry.value.image_input.pixel_budget === "low"
            ? "low"
            : "custom",
      ),
      setBudget = refSetter(budget);
    const pixels = shallowRef(
        typeof entry.value.image_input.pixel_budget === "number"
          ? String(entry.value.image_input.pixel_budget)
          : "1048576",
      ),
      setPixels = refSetter(pixels);
    const bytes = shallowRef(String(entry.value.image_input.max_bytes)),
      setBytes = refSetter(bytes);
    const customPixels = computed(() => Number(pixels.value));
    const maximumBytes = computed(() => Number(bytes.value));
    const outputLimit = computed(() => Number(outputTokens.value));
    const contextWindow = computed(() =>
      windowTokens.value === "" ? null : Number(windowTokens.value),
    );
    const retention = computed(() => Number(retentionTokens.value));
    const capacityValid = computed(
      () =>
        Number.isSafeInteger(retention.value) &&
        retention.value >= 0 &&
        retention.value <= 100000000 &&
        (contextWindow.value === null ||
          (Number.isSafeInteger(contextWindow.value) &&
            contextWindow.value > 0 &&
            contextWindow.value <= 100000000 &&
            outputLimit.value + retention.value < contextWindow.value)),
    );
    const valid = computed(
      () =>
        capacityValid.value &&
        validReasoningSettings(reasoning.value) &&
        Number.isSafeInteger(outputLimit.value) &&
        outputLimit.value > 0 &&
        outputLimit.value <= 100000000 &&
        (!enabled.value ||
          (Number.isSafeInteger(maximumBytes.value) &&
            maximumBytes.value > 0 &&
            maximumBytes.value <= 16777216 &&
            (budget.value !== "custom" ||
              (Number.isSafeInteger(customPixels.value) &&
                customPixels.value > 0 &&
                customPixels.value <= 100000000)))),
    );
    function edit() {
      setSaveFailed(false);
      setReasoning(entry.value.reasoning_settings);
      setWindowTokens(
        entry.value.context_window === null
          ? ""
          : String(entry.value.context_window),
      );
      setRetentionTokens(String(entry.value.retention_tokens));
      setOutputTokens(String(entry.value.max_output_tokens));
      setEnabled(entry.value.image_input.enabled);
      setBudget(
        entry.value.image_input.pixel_budget === null
          ? "default"
          : entry.value.image_input.pixel_budget === "low"
            ? "low"
            : "custom",
      );
      setPixels(
        typeof entry.value.image_input.pixel_budget === "number"
          ? String(entry.value.image_input.pixel_budget)
          : "1048576",
      );
      setBytes(String(entry.value.image_input.max_bytes));
      onEdit.value();
    }
    async function save() {
      setSaveFailed(false);
      const saved = await onSave.value({
        context_window: contextWindow.value,
        retention_tokens: retention.value,
        reasoning_settings: reasoning.value,
        max_output_tokens: outputLimit.value,
        image_input: enabled.value
          ? {
              enabled: true,
              pixel_budget:
                budget.value === "default"
                  ? null
                  : budget.value === "low"
                    ? "low"
                    : customPixels.value,
              max_bytes: maximumBytes.value,
            }
          : {
              enabled: false,
              pixel_budget: null,
              max_bytes: 2097152,
            },
      });
      setSaveFailed(!saved);
    }
    return () => {
      const _entry = entry.value,
        _editing = editing.value,
        _disabled2 = disabled.value,
        _valid = valid.value,
        _onCancel = onCancel.value,
        _capacityValid = capacityValid.value,
        _protocol2 = protocol.value;
      return (
        <ModelExpandableRow
          label={_entry.display_name ?? _entry.model_id}
          value={content.summary(
            _entry.max_output_tokens,
            _entry.image_input.enabled,
          )}
          actionLabel={zhCN.modelConnections.detail.edit}
          editing={_editing}
          busy={_disabled2}
          canSave={_valid}
          onEdit={edit}
          onCancel={_onCancel}
          onSave={() => void save()}
        >
          <label class="provider-form-field">
            <span>{content.maxOutput}</span>
            <Input
              aria-label={content.maxOutput}
              type="number"
              min={1}
              max={100000000}
              step={1}
              disabled={_disabled2}
              value={outputTokens.value}
              onInput={(event) =>
                setOutputTokens((event.target as HTMLInputElement).value)
              }
            />
          </label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="provider-form-field">
              <span>{content.contextWindow}</span>
              <Input
                aria-label={content.contextWindow}
                placeholder={content.contextUnknown}
                type="number"
                min={1}
                max={100000000}
                step={1}
                disabled={_disabled2}
                value={windowTokens.value}
                onInput={(event) =>
                  setWindowTokens((event.target as HTMLInputElement).value)
                }
              />
            </label>
            <label class="provider-form-field">
              <span>{content.retention}</span>
              <Input
                aria-label={content.retention}
                type="number"
                min={0}
                max={100000000}
                step={1}
                disabled={_disabled2}
                value={retentionTokens.value}
                onInput={(event) =>
                  setRetentionTokens((event.target as HTMLInputElement).value)
                }
              />
            </label>
          </div>
          <p class="text-xs leading-5 text-muted-foreground">
            {content.contextHelp}
          </p>
          {!_capacityValid && (
            <p role="alert" class="text-xs text-destructive">
              {content.contextInvalid}
            </p>
          )}
          <ReasoningSettings
            value={reasoning.value}
            protocol={_protocol2}
            disabled={_disabled2}
            onChange={setReasoning}
          />
          <label class="flex items-center gap-2 text-sm">
            <Checkbox
              checked={enabled.value}
              disabled={_disabled2}
              onUpdate:modelValue={(value) => setEnabled(value === true)}
            />
            {content.imageInput}
          </label>
          {enabled.value && (
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="provider-form-field">
                <span>{content.pixelBudget}</span>
                <select
                  value={budget.value}
                  disabled={_disabled2}
                  onChange={(event) =>
                    setBudget((event.target as HTMLInputElement).value)
                  }
                >
                  <option value="default">{content.defaultBudget}</option>
                  <option value="low">{content.lowBudget}</option>
                  <option value="custom">{content.customBudget}</option>
                </select>
                {budget.value === "custom" && (
                  <Input
                    aria-label={content.customPixels}
                    type="number"
                    min={1}
                    max={100000000}
                    step={1}
                    disabled={_disabled2}
                    value={pixels.value}
                    onInput={(event) =>
                      setPixels((event.target as HTMLInputElement).value)
                    }
                  />
                )}
              </label>
              <label class="provider-form-field">
                <span>{content.maxBytes}</span>
                <Input
                  type="number"
                  min={1}
                  max={16777216}
                  step={1}
                  disabled={_disabled2}
                  value={bytes.value}
                  onInput={(event) =>
                    setBytes((event.target as HTMLInputElement).value)
                  }
                />
              </label>
            </div>
          )}
          {!_valid && (
            <p role="alert" class="text-xs text-destructive">
              {content.invalidLimits}
            </p>
          )}
          {saveFailed.value && (
            <p role="alert" class="text-xs text-destructive">
              {content.saveFailed}
            </p>
          )}
        </ModelExpandableRow>
      );
    };
  },
  {
    name: "ModelSettingsRow",
    inheritAttrs: false,
    props: [
      "entry",
      "protocol",
      "disabled",
      "editing",
      "onEdit",
      "onCancel",
      "onSave",
    ],
  },
);
