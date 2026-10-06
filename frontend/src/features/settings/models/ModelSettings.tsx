import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { zhCN } from "@/locales/zh-CN";
import type { ModelCatalogEntry, ModelSettings as ModelSettingsInput } from "./api";
import { ModelExpandableRow } from "./ModelConnectionDetailControls";

const content = zhCN.modelConnections.modelSettings;

export function ModelSettings({ entries, disabled, onSave }: {
  readonly entries: readonly ModelCatalogEntry[];
  readonly disabled: boolean;
  readonly onSave: (modelId: string, input: ModelSettingsInput) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return <div className="space-y-2">
    <p className="text-xs leading-5 text-muted-foreground">{content.help}</p>
    {entries.length === 0 && <p className="text-xs text-muted-foreground">{content.noModels}</p>}
    {entries.map((entry) => <ModelSettingsRow key={entry.model_id} entry={entry}
      disabled={disabled} editing={editing === entry.model_id}
      onEdit={() => setEditing(entry.model_id)} onCancel={() => setEditing(null)}
      onSave={async (input) => {
        const saved = await onSave(entry.model_id, input);
        if (saved) setEditing(null);
        return saved;
      }} />)}
  </div>;
}

function ModelSettingsRow({ entry, disabled, editing, onEdit, onCancel, onSave }: {
  readonly entry: ModelCatalogEntry;
  readonly disabled: boolean;
  readonly editing: boolean;
  readonly onEdit: () => void;
  readonly onCancel: () => void;
  readonly onSave: (input: ModelSettingsInput) => Promise<boolean>;
}) {
  const [saveFailed, setSaveFailed] = useState(false);
  const [outputTokens, setOutputTokens] = useState(String(entry.max_output_tokens));
  const [enabled, setEnabled] = useState(entry.image_input.enabled);
  const [budget, setBudget] = useState(entry.image_input.pixel_budget === null ? "default" : entry.image_input.pixel_budget === "low" ? "low" : "custom");
  const [pixels, setPixels] = useState(typeof entry.image_input.pixel_budget === "number" ? String(entry.image_input.pixel_budget) : "1048576");
  const [bytes, setBytes] = useState(String(entry.image_input.max_bytes));
  const customPixels = Number(pixels);
  const maximumBytes = Number(bytes);
  const outputLimit = Number(outputTokens);
  const valid = Number.isSafeInteger(outputLimit) && outputLimit > 0 && outputLimit <= 100000000 && (!enabled || (Number.isSafeInteger(maximumBytes) && maximumBytes > 0 && maximumBytes <= 16777216
    && (budget !== "custom" || (Number.isSafeInteger(customPixels) && customPixels > 0 && customPixels <= 100000000))));

  function edit() {
    setSaveFailed(false);
    setOutputTokens(String(entry.max_output_tokens));
    setEnabled(entry.image_input.enabled);
    setBudget(entry.image_input.pixel_budget === null ? "default" : entry.image_input.pixel_budget === "low" ? "low" : "custom");
    setPixels(typeof entry.image_input.pixel_budget === "number" ? String(entry.image_input.pixel_budget) : "1048576");
    setBytes(String(entry.image_input.max_bytes));
    onEdit();
  }

  async function save() {
    setSaveFailed(false);
    const saved = await onSave({ max_output_tokens: outputLimit, image_input: enabled ? {
      enabled: true, pixel_budget: budget === "default" ? null : budget === "low" ? "low" : customPixels,
      max_bytes: maximumBytes,
    } : { enabled: false, pixel_budget: null, max_bytes: 2097152 } });
    setSaveFailed(!saved);
  }

  return <ModelExpandableRow label={entry.display_name ?? entry.model_id}
    value={content.summary(entry.max_output_tokens, entry.image_input.enabled)}
    actionLabel={zhCN.modelConnections.detail.edit} editing={editing} busy={disabled}
    canSave={valid} onEdit={edit} onCancel={onCancel}
    onSave={() => void save()}>
    <label className="provider-form-field"><span>{content.maxOutput}</span>
      <Input aria-label={content.maxOutput} type="number" min={1} max={100000000} step={1} disabled={disabled}
        value={outputTokens} onChange={(event) => setOutputTokens(event.target.value)} />
    </label>
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={enabled} disabled={disabled} onCheckedChange={(value) => setEnabled(value === true)} />
      {content.imageInput}
    </label>
    {enabled && <div className="grid gap-3 sm:grid-cols-2">
      <label className="provider-form-field"><span>{content.pixelBudget}</span>
        <select value={budget} disabled={disabled} onChange={(event) => setBudget(event.target.value)}>
          <option value="default">{content.defaultBudget}</option>
          <option value="low">{content.lowBudget}</option>
          <option value="custom">{content.customBudget}</option>
        </select>
        {budget === "custom" && <Input aria-label={content.customPixels} type="number" min={1} max={100000000} step={1}
          disabled={disabled} value={pixels} onChange={(event) => setPixels(event.target.value)} />}
      </label>
      <label className="provider-form-field"><span>{content.maxBytes}</span>
        <Input type="number" min={1} max={16777216} step={1} disabled={disabled} value={bytes}
          onChange={(event) => setBytes(event.target.value)} />
      </label>
    </div>}
    {!valid && <p role="alert" className="text-xs text-destructive">{content.invalidLimits}</p>}
    {saveFailed && <p role="alert" className="text-xs text-destructive">{content.saveFailed}</p>}
  </ModelExpandableRow>;
}
