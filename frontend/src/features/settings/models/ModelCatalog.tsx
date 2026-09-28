import { LoaderCircle, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { zhCN } from "@/locales/zh-CN";
import type {
  ModelCatalogEntry,
  ModelCheckStatus,
  ModelConnection
} from "./api";
import { providerErrorLabel } from "./model";

const content = zhCN.modelConnections;

interface ModelCatalogProps {
  readonly connection: ModelConnection;
  readonly selectedModelId: string;
  readonly manualModelId: string;
  readonly busyAction: string | null;
  readonly onSelectedModelIdChange: (modelId: string) => void;
  readonly onManualModelIdChange: (modelId: string) => void;
  readonly onDiscover: () => void;
  readonly onAddManualModel: () => void;
  readonly onDeleteManualModel: (modelId: string) => void;
  readonly onToggleModel: (modelId: string, enabled: boolean) => void;
  readonly onTest: (mode: "text" | "tools") => void;
}

export function ModelCatalog({
  connection,
  selectedModelId,
  manualModelId,
  busyAction,
  onSelectedModelIdChange,
  onManualModelIdChange,
  onDiscover,
  onAddManualModel,
  onDeleteManualModel,
  onToggleModel,
  onTest
}: ModelCatalogProps) {
  const discoveryBusy =
    connection.discovery.status === "pending" ||
    busyAction === "discover";
  const currentEntries = connection.entries.filter(
    (entry) => entry.revision === connection.revision || entry.availability === "unavailable"
  );
  const testableEntries = connection.entries.filter(
    (entry) =>
      entry.revision === connection.revision && entry.availability === "available"
  );
  const lastSuccess = connection.discovery.last_success_at
    ? content.dateTime(new Date(connection.discovery.last_success_at))
    : content.never;

  return (
    <section className="model-settings-card">
      <div className="model-settings-card__heading model-settings-card__heading--actions">
        <div>
          <h2>{content.sections.models}</h2>
          <p>{content.catalog.description}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busyAction !== null || connection.management_status !== "ready"}
          onClick={onDiscover}
        >
          {discoveryBusy ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {content.catalog.refresh}
        </Button>
      </div>

      <div className="model-catalog-summary">
        <span>{content.catalog.lastSuccess(lastSuccess)}</span>
        <span>{content.catalog.revision(connection.revision)}</span>
      </div>

      {connection.discovery.status === "failed" || connection.discovery.status === "interrupted" ? (
        <div className="model-settings-notice model-settings-notice--warning" role="status">
          <div>
            <strong>{content.catalog.discoveryFailed}</strong>
            <span>{providerErrorLabel(connection.discovery.error_code)}</span>
          </div>
          <span>{content.catalog.failureKeepsCatalog}</span>
        </div>
      ) : null}

      <div className="model-catalog-testbar">
        <label>
          <span>{content.catalog.testModel}</span>
          <select
            value={selectedModelId}
            disabled={testableEntries.length === 0 || busyAction !== null}
            onChange={(event) => onSelectedModelIdChange(event.target.value)}
          >
            {testableEntries.length === 0 ? (
              <option value="">{content.catalog.noModels}</option>
            ) : null}
            {testableEntries.map((entry) => (
              <option key={entry.model_id} value={entry.model_id}>
                {entry.model_id}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={selectedModelId === "" || busyAction !== null}
          onClick={() => onTest("text")}
        >
          {busyAction === "test-text" ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          {content.catalog.testText}
        </Button>
        <Button
          size="sm"
          disabled={selectedModelId === "" || busyAction !== null}
          onClick={() => onTest("tools")}
        >
          {busyAction === "test-tools" ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          {content.catalog.testTools}
        </Button>
      </div>

      <div className="model-catalog-list">
        {currentEntries.length === 0 ? (
          <div className="model-catalog-empty">
            <p>{content.catalog.emptyTitle}</p>
            <span>{content.catalog.emptyDescription}</span>
          </div>
        ) : (
          currentEntries.map((entry) => (
            <CatalogRow
              key={entry.model_id}
              entry={entry}
              connectionRevision={connection.revision}
              disabled={busyAction !== null || connection.management_status !== "ready"}
              onToggle={(enabled) => onToggleModel(entry.model_id, enabled)}
              onDeleteManual={() => onDeleteManualModel(entry.model_id)}
            />
          ))
        )}
      </div>

      <form
        className="model-manual-add"
        onSubmit={(event) => {
          event.preventDefault();
          onAddManualModel();
        }}
      >
        <label>
          <span>{content.catalog.manualTitle}</span>
          <small>{content.catalog.manualHelp}</small>
        </label>
        <Input
          value={manualModelId}
          maxLength={256}
          placeholder={content.catalog.manualPlaceholder}
          disabled={busyAction !== null}
          onChange={(event) => onManualModelIdChange(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={manualModelId.trim() === "" || busyAction !== null}
        >
          {busyAction === "manual-add" ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          {content.catalog.manualAdd}
        </Button>
      </form>
    </section>
  );
}

function CatalogRow({
  entry,
  connectionRevision,
  disabled,
  onToggle,
  onDeleteManual
}: {
  readonly entry: ModelCatalogEntry;
  readonly connectionRevision: number;
  readonly disabled: boolean;
  readonly onToggle: (enabled: boolean) => void;
  readonly onDeleteManual: () => void;
}) {
  const available =
    entry.revision === connectionRevision && entry.availability === "available";
  const discoveredAt = entry.discovered_at
    ? content.dateTime(new Date(entry.discovered_at))
    : content.never;
  const isManual = entry.sources.includes("manual");

  return (
    <div className={`model-catalog-row${available ? "" : " model-catalog-row--unavailable"}`}>
      <Checkbox
        aria-label={content.catalog.enableNamed(entry.model_id)}
        checked={entry.enabled && available}
        disabled={disabled || !available}
        onCheckedChange={(checked) => onToggle(checked === true)}
      />
      <div className="model-catalog-row__main">
        <div className="model-catalog-row__title">
          <code>{entry.model_id}</code>
          {entry.display_name && entry.display_name !== entry.model_id ? (
            <span>{entry.display_name}</span>
          ) : null}
          {!available ? (
            <span className="model-settings-tag model-settings-tag--warning">
              {content.catalog.unavailable}
            </span>
          ) : null}
        </div>
        <div className="model-catalog-row__meta">
          <span>{content.catalog.sources(entry.sources.map(sourceLabel).join(" + "))}</span>
          <span>{content.catalog.discoveredAt(discoveredAt)}</span>
        </div>
      </div>
      <div className="model-catalog-row__checks">
        <CheckBadge label={content.catalog.textCheck} status={entry.checks.text.status} />
        <CheckBadge label={content.catalog.toolCheck} status={entry.checks.tools.status} />
      </div>
      {isManual ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          aria-label={content.catalog.removeManualNamed(entry.model_id)}
          title={content.catalog.removeManual}
          disabled={disabled}
          onClick={onDeleteManual}
        >
          <Trash2 className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

function CheckBadge({ label, status }: { readonly label: string; readonly status: ModelCheckStatus }) {
  return (
    <span className={`model-check-badge model-check-badge--${status}`}>
      {label} · {content.checkStatus[status]}
    </span>
  );
}

function sourceLabel(source: "fetched" | "manual"): string {
  return content.source[source];
}
