import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsPageHeader, SettingsPageWrapper } from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";
import { modelConnectionsApi, type ModelConnection, type ModelProtocol } from "./api";
import {
  EnabledModelSelector,
  ModelDetailSection,
  ModelExpandableRow
} from "./ModelConnectionDetailControls";
import { connectionErrorMessage, connectionStatus, providerErrorLabel } from "./model";
import { providerName } from "./provider-copy";
import { ProviderLogo } from "./ProviderLogo";
import { ModelSettings } from "./ModelSettings";
import { ModelRetryPolicySettings } from "./ModelRetryPolicySettings";
import { protocolsForProvider } from "./providers";

const content = zhCN.modelConnections;

export function ModelConnectionDetailPage() {
  const { connectionId } = useParams();
  if (connectionId === undefined) throw new Error("Model connection route requires an identifier.");
  const resolvedConnectionId = connectionId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryKey = ["model-connections", resolvedConnectionId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => modelConnectionsApi.get(resolvedConnectionId),
    refetchInterval: (state) => state.state.data?.discovery.status === "pending" ? 1200 : false
  });
  const connection = query.data;
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [editingRow, setEditingRow] = useState<"credential" | "endpoint" | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const actionRunning = useRef(false);

  useEffect(() => {
    if (connection !== undefined && editingRow !== "endpoint") setBaseUrl(connection.base_url);
  }, [connection, editingRow]);

  function publish(next: ModelConnection) {
    queryClient.setQueryData(queryKey, next);
    void queryClient.invalidateQueries({ queryKey: ["model-connections"], exact: true });
  }

  async function perform(
    name: string,
    operation: () => Promise<ModelConnection | void>,
    successMessage?: string
  ) {
    if (actionRunning.current) return false;
    actionRunning.current = true;
    setBusyAction(name);
    setActionError(null);
    try {
      const next = await operation();
      if (next !== undefined) publish(next);
      if (successMessage !== undefined) toast.success(successMessage);
      return true;
    } catch (error) {
      setActionError(connectionErrorMessage(error));
      console.error("[models] Connection update failed.", { connectionId: resolvedConnectionId, action: name, error });
      return false;
    } finally {
      actionRunning.current = false;
      setBusyAction(null);
    }
  }

  async function refreshConnection(operation: () => Promise<unknown>) {
    await operation();
    const next = await modelConnectionsApi.get(resolvedConnectionId);
    publish(next);
  }

  if (query.isLoading || connection === undefined) {
    return (
      <SettingsPageWrapper>
        <SettingsPageHeader title={content.title} description={content.description} actions={null} />
        {query.isError ? (
          <div className="model-notice model-notice--error" role="alert">
            <span>{connectionErrorMessage(query.error)}</span>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>{content.retry}</Button>
          </div>
        ) : (
          <div className="model-loading"><LoaderCircle className="size-5 animate-spin" />{content.detail.loading}</div>
        )}
      </SettingsPageWrapper>
    );
  }

  const status = connectionStatus(connection);
  const availableEntries = connection.entries.filter(
    (entry) => entry.revision === connection.revision && entry.availability === "available"
  );
  const selectableEntries = connection.entries.filter(
    (entry) => (entry.revision === connection.revision && entry.availability === "available") || entry.enabled
  );
  const usableEntries = availableEntries.filter(
    (entry) => entry.enabled && entry.checks.text.status === "passed" && entry.checks.tools.status === "passed"
  );
  const testModelId = connection.default_model_id
    ?? availableEntries.find((entry) => entry.enabled)?.model_id
    ?? availableEntries[0]?.model_id
    ?? "";
  const showsEndpoint = connection.provider_type === "deepseek" || connection.provider_type === "openai" || connection.provider_type === "custom"
    || connection.provider_type === "ollama"
    || connection.provider_type === "lm_studio"
    || connection.provider_type === "localai";

  return (
    <SettingsPageWrapper>
      <SettingsPageHeader title={content.title} description={content.description} actions={null} />
      <div className="model-route-page model-detail">
        <div className="model-route-header">
          <button type="button" className="model-route-header__back" onClick={() => void navigate("/settings/models")}>
            {content.backToList}
          </button>
          <div className="model-route-header__identity">
            <ProviderLogo type={connection.provider_type} compact />
            <div>
              <div className="model-route-header__title-line">
                <h2>{connection.display_name}</h2>
                {connection.is_default ? <span className="model-badge">{content.defaultBadge}</span> : null}
              </div>
              <p>{[providerName[connection.provider_type], connection.default_model_id].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
        </div>

        {actionError !== null ? <div className="model-notice model-notice--error" role="alert">{actionError}</div> : null}
        {status.tone !== "ready" ? (
          <div className="model-notice" role="status">
            <span className={`model-status model-status--${status.tone}`}>
              <span className="model-status__dot" />{status.label}
            </span>
          </div>
        ) : null}

        <ModelDetailSection title={content.detail.credentials} description={content.detail.credentialsHelp}>
          {connection.provider_type === "deepseek" || connection.provider_type === "openai" || connection.provider_type === "custom" ? (
            <label className="provider-form-field">
              <span>{content.detail.protocol}</span>
              <select value={connection.protocol} disabled={busyAction !== null} onChange={(event) => {
                const protocol = event.target.value as ModelProtocol;
                const official = connection.provider_type === "deepseek" && (connection.base_url === "https://api.deepseek.com" || connection.base_url === "https://api.deepseek.com/anthropic");
                void perform("protocol", () => modelConnectionsApi.update(connection.id, {
                  protocol, max_tokens_field: protocol === "openai_compatible" && connection.provider_type === "openai" ? "max_completion_tokens" : "max_tokens", include_usage: false,
                  ...(official ? { base_url: protocol === "deepseek_messages" ? "https://api.deepseek.com/anthropic" : "https://api.deepseek.com" } : {}),
                }));
              }}>
                {protocolsForProvider(connection.provider_type).map((value) => <option key={value} value={value}>{content.protocols[value]}</option>)}
              </select>
            </label>
          ) : null}
          {connection.auth_mode === "api_key" ? (
            <ModelExpandableRow
              label={content.detail.modelKey}
              value={connection.credential.configured ? content.detail.keySet : content.detail.keyMissing}
              actionLabel={connection.credential.configured ? content.detail.change : content.detail.set}
              editing={editingRow === "credential"}
              busy={busyAction !== null}
              canSave={apiKey.trim() !== ""}
              onEdit={() => { setEditingRow("credential"); setApiKey(""); }}
              onCancel={() => { setEditingRow(null); setApiKey(""); }}
              onSave={() => void perform("credential", async () => {
                const next = await modelConnectionsApi.setCredential(connection.id, apiKey.trim());
                setEditingRow(null);
                setApiKey("");
                return next;
              }, content.detail.keySaved)}
            >
              <Input
                autoFocus
                type="password"
                autoComplete="new-password"
                value={apiKey}
                placeholder={content.create.apiKeyPlaceholder}
                disabled={busyAction !== null}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </ModelExpandableRow>
          ) : (
            <div className="model-detail__quiet">{content.detail.noCredential}</div>
          )}
          {showsEndpoint ? (
            <ModelExpandableRow
              label={content.detail.endpoint}
              value={connection.base_url}
              actionLabel={content.detail.edit}
              editing={editingRow === "endpoint"}
              busy={busyAction !== null}
              canSave={baseUrl.trim() !== "" && baseUrl.trim() !== connection.base_url}
              onEdit={() => { setEditingRow("endpoint"); setBaseUrl(connection.base_url); }}
              onCancel={() => { setEditingRow(null); setBaseUrl(connection.base_url); }}
              onSave={() => void perform("endpoint", async () => {
                const next = await modelConnectionsApi.update(connection.id, { base_url: baseUrl });
                setEditingRow(null);
                return next;
              }, content.saved)}
            >
              <Input
                autoFocus
                type="url"
                value={baseUrl}
                disabled={busyAction !== null}
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </ModelExpandableRow>
          ) : null}
        </ModelDetailSection>

        <ModelDetailSection title={content.detail.models} description={content.detail.modelsHelp}>
          <EnabledModelSelector
            entries={selectableEntries}
            enabledIds={connection.enabled_model_ids}
            disabled={busyAction !== null}
            onChange={(ids) => void perform("enabled-models", () =>
              modelConnectionsApi.update(connection.id, { enabled_model_ids: ids })
            )}
          />
          <label className="provider-form-field">
            <span>{content.detail.defaultModel}</span>
            <select
              value={connection.default_model_id ?? ""}
              disabled={busyAction !== null}
              onChange={(event) => void perform("default-model", () =>
                modelConnectionsApi.update(connection.id, { default_model_id: event.target.value || null })
              )}
            >
              <option value="">{content.detail.noDefaultModel}</option>
              {usableEntries.map((entry) => (
                <option key={entry.model_id} value={entry.model_id}>{entry.display_name || entry.model_id}</option>
              ))}
            </select>
          </label>
          <div className="model-detail__actions">
            <Button
              size="sm"
              variant="secondary"
              disabled={busyAction !== null || testModelId === "" || connection.credential.status !== "ready"}
              onClick={() => void perform("test", async () => {
                const result = await modelConnectionsApi.test(connection.id, testModelId, "tools");
                await refreshConnection(async () => result);
                if (result.status !== "passed") {
                  throw new Error(providerErrorLabel(result.error_code) ?? content.detail.testFailed);
                }
              }, content.detail.testSucceeded)}
            >
              {busyAction === "test" ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              {content.detail.test}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busyAction !== null || connection.credential.status !== "ready"}
              onClick={() => void perform(
                "discover",
                () => refreshConnection(() => modelConnectionsApi.discover(connection.id)),
                content.detail.modelsUpdated
              )}
            >
              {busyAction === "discover" || connection.discovery.status === "pending"
                ? <LoaderCircle className="size-3.5 animate-spin" />
                : null}
              {content.detail.updateModels}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busyAction !== null || connection.is_default}
              onClick={() => void perform("default-connection", () => modelConnectionsApi.setDefault(connection.id), content.detail.defaultSet)}
            >
              {connection.is_default ? <Check className="size-3.5" /> : null}
              {connection.is_default ? content.detail.defaultConnection : content.detail.setDefaultConnection}
            </Button>
          </div>
        </ModelDetailSection>

        <ModelDetailSection title={content.modelSettings.title} description={content.modelSettings.description}>
          <ModelSettings entries={availableEntries.filter((entry) => entry.enabled)} disabled={busyAction !== null}
            onSave={(modelId, input) => perform("model-settings", () => refreshConnection(
              () => modelConnectionsApi.setModelSettings(connection.id, modelId, input)
            ), content.saved)} />
        </ModelDetailSection>

        <ModelRetryPolicySettings connection={connection} disabled={busyAction !== null}
          onSave={(policy) => perform("retry", () => modelConnectionsApi.update(connection.id, { retry_policy: policy }), content.saved)} />
        <ModelDetailSection title={content.detail.danger} description={content.detail.dangerHelp}>
          <div><Button variant="destructive" size="sm" disabled={busyAction !== null} onClick={() => setConfirmDelete(true)}>{content.detail.delete}</Button></div>
        </ModelDetailSection>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogTitle>{content.detail.deleteTitle(connection.display_name)}</AlertDialogTitle>
          <AlertDialogDescription>{content.detail.deleteDescription}</AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>{content.cancel}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busyAction !== null}
              onClick={() => void perform("delete", async () => {
                if (connection.is_default) await modelConnectionsApi.update(connection.id, { is_default: false });
                await modelConnectionsApi.delete(connection.id);
                await queryClient.invalidateQueries({ queryKey: ["model-connections"] });
                setConfirmDelete(false);
                void navigate("/settings/models", { replace: true });
              })}
            >
              {busyAction === "delete" ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              {content.detail.delete}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPageWrapper>
  );
}
