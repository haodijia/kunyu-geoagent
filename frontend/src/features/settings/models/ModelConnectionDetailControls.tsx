import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { zhCN } from "@/locales/zh-CN";
import type { ModelConnection } from "./api";

const content = zhCN.modelConnections;

export function ModelDetailSection({
  title,
  description,
  children
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="model-detail-section">
      <div className="model-detail-section__heading"><h3>{title}</h3><p>{description}</p></div>
      <div className="model-detail-section__content">{children}</div>
    </section>
  );
}

export function ModelExpandableRow({
  label,
  value,
  actionLabel,
  editing,
  busy,
  canSave,
  onEdit,
  onCancel,
  onSave,
  children
}: {
  readonly label: string;
  readonly value: string;
  readonly actionLabel: string;
  readonly editing: boolean;
  readonly busy: boolean;
  readonly canSave: boolean;
  readonly onEdit: () => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div className="model-expandable-row">
      <div className="model-expandable-row__summary">
        <span><strong>{label}</strong><small>{value}</small></span>
        {!editing ? <Button size="sm" variant="ghost" disabled={busy} onClick={onEdit}>{actionLabel}</Button> : null}
      </div>
      {editing ? (
        <div className="model-expandable-row__editor">
          {children}
          <div className="model-expandable-row__actions">
            <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>{content.cancel}</Button>
            <Button size="sm" disabled={busy || !canSave} onClick={onSave}>{content.detail.save}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EnabledModelSelector({
  entries,
  enabledIds,
  disabled,
  onChange
}: {
  readonly entries: ModelConnection["entries"];
  readonly enabledIds: string[];
  readonly disabled: boolean;
  readonly onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return entries.filter((entry) => [entry.model_id, entry.display_name ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(normalized)));
  }, [entries, query]);
  const label = enabledIds.length === 0 ? content.detail.noModels : enabledIds.join(", ");

  return (
    <div className="model-selector">
      <button type="button" disabled={disabled || entries.length === 0} onClick={() => setOpen((current) => !current)}>
        <span>{label}</span><ChevronDown className="size-4" />
      </button>
      {open ? (
        <div className="model-selector__popover">
          <label>
            <Search className="size-4" />
            <Input value={query} placeholder={content.detail.searchModels} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="model-selector__list">
            {filtered.map((entry) => {
              const available = entry.availability === "available";
              return (
                <label key={entry.model_id}>
                  <Checkbox
                    checked={enabledIds.includes(entry.model_id)}
                    disabled={disabled || !available}
                    onCheckedChange={(checked) => onChange(
                      checked === true
                        ? [...enabledIds, entry.model_id]
                        : enabledIds.filter((id) => id !== entry.model_id)
                    )}
                  />
                  <span>{entry.display_name || entry.model_id}<small>{entry.model_id}</small></span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
