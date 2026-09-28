import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, Trash2 } from "lucide-react";
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
import {
  SettingsPageHeader,
  SettingsPageWrapper
} from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";
import {
  modelConnectionsApi,
  type ModelConnection,
  type UpdateModelConnectionInput
} from "./api";
import { ModelCatalog } from "./ModelCatalog";
import {
  ModelConnectionForm,
  type ConnectionDraft
} from "./ModelConnectionForm";
import {
  connectionErrorMessage,
  connectionStatus,
  providerErrorLabel
} from "./model";

const content = zhCN.modelConnections;
type ConfirmAction = "clear-credential" | "delete" | null;

export function ModelConnectionDetailPage() {
  const { connectionId } = useParams();
  if (connectionId === undefined) {
    throw new Error("Model connection route requires an identifier.");
  }
  const resolvedConnectionId = connectionId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryKey = ["model-connections", resolvedConnectionId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => modelConnectionsApi.get(resolvedConnectionId),
    refetchInterval: (state) => {
      const connection = state.state.data;
      return connection !== undefined &&
        (connection.management_status !== "ready" ||
          connection.discovery.status === "pending")
        ? 1200
        : false;
    }
  });
  const connection = query.data;
  const seededConnectionId = useRef<string | null>(null);
  const [draft, setDraft] = useState<ConnectionDraft | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [manualModelId, setManualModelId] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const actionRunning = useRef(false);

  useEffect(() => {
    if (connection === undefined || seededConnectionId.current === connection.id) return;
    seededConnectionId.current = connection.id;
    setDraft(toDraft(connection));
    setApiKey("");
    setManualModelId("");
    setActionError(null);
    const defaultEntry = connection.entries.find(
      (entry) =>
        entry.model_id === connection.default_model_id &&
        entry.revision === connection.revision &&
        entry.availability === "available"
    );
    setSelectedModelId(
      defaultEntry?.model_id ??
        connection.entries.find(
          (entry) =>
            entry.revision === connection.revision && entry.availability === "available"
        )?.model_id ??
        ""
    );
  }, [connection]);

  useEffect(() => {
    if (connection === undefined) return;
    const firstAvailable = connection.entries.find(
      (entry) =>
        entry.revision === connection.revision && entry.availability === "available"
    )?.model_id;
    if (selectedModelId === "") {
      if (firstAvailable !== undefined) setSelectedModelId(firstAvailable);
      return;
    }
    const selectionExists = connection.entries.some(
      (entry) =>
        entry.model_id === selectedModelId &&
        entry.revision === connection.revision &&
        entry.availability === "available"
    );
    if (!selectionExists) {
      setSelectedModelId(firstAvailable ?? "");
    }
  }, [connection, selectedModelId]);

  function publish(next: ModelConnection) {
    queryClient.setQueryData(queryKey, next);
    void queryClient.invalidateQueries({ queryKey: ["model-connections"], exact: true });
  }

  async function perform(
    name: string,
    operation: () => Promise<ModelConnection | void>,
    successMessage?: string
  ) {
    if (actionRunning.current) return;
    actionRunning.current = true;
    setBusyAction(name);
    setActionError(null);
    try {
      const next = await operation();
      if (next !== undefined) publish(next);
      if (successMessage !== undefined) toast.success(successMessage);
    } catch (error) {
      setActionError(connectionErrorMessage(error));
    } finally {
      actionRunning.current = false;
      setBusyAction(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (connection === undefined || draft === null) return;
    const changes: UpdateModelConnectionInput = {
      display_name: draft.displayName,
      base_url: draft.baseUrl,
      auth_mode: draft.authMode,
      enabled: draft.enabled,
      max_tokens_field: draft.maxTokensField,
      include_usage: draft.includeUsage
    };
    await perform(
      "save",
      async () => {
        const next = await modelConnectionsApi.update(connection.id, changes);
        setDraft(toDraft(next));
        return next;
      },
      content.saved
    );
  }

  async function refreshAfter(operation: () => Promise<unknown>) {
    await operation();
    const next = await modelConnectionsApi.get(resolvedConnectionId);
    publish(next);
  }

  const status = connection ? connectionStatus(connection) : null;
  const usableDefaults = connection?.entries.filter(
    (entry) =>
      entry.revision === connection.revision &&
      entry.availability === "available" &&
      entry.enabled &&
      entry.checks.text.status === "passed" &&
      entry.checks.tools.status === "passed"
  ) ?? [];

  if (query.isLoading || connection === undefined || draft === null) {
    return (
      <SettingsPageWrapper>
        <SettingsPageHeader
          title={content.detail.loadingTitle}
          description={content.detail.loadingDescription}
          actions={null}
        />
        {query.isError ? (
          <div className="model-settings-notice model-settings-notice--error" role="alert">
            <span>{connectionErrorMessage(query.error)}</span>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              {content.retry}
            </Button>
          </div>
        ) : (
          <div className="model-settings-loading" role="status">
            <LoaderCircle className="size-5 animate-spin" />
            {content.detail.loading}
          </div>
        )}
      </SettingsPageWrapper>
    );
  }

  return (
    <SettingsPageWrapper>
      <SettingsPageHeader
        title={connection.display_name}
        description={content.detail.description}
        actions={
          <Button variant="ghost" size="sm" onClick={() => void navigate("/settings/models")}>
            <ArrowLeft className="size-3.5" />
            {content.backToList}
          </Button>
        }
      />

      <div className="model-detail-statusbar">
        <span className={`model-connection-status model-connection-status--${status?.tone}`}>
          <span className="model-connection-status__dot" />
          {status?.label}
        </span>
        <span>{content.detail.configRevision(connection.revision)}</span>
        {connection.is_default ? (
          <span className="model-settings-tag">{content.defaultBadge}</span>
        ) : null}
      </div>

      {actionError !== null ? (
        <div className="model-settings-notice model-settings-notice--error" role="alert">
          <span>{actionError}</span>
          <span>{content.detail.retryHint}</span>
        </div>
      ) : null}

      <ModelConnectionForm
        connection={connection}
        draft={draft}
        apiKey={apiKey}
        busyAction={busyAction}
        onDraftChange={setDraft}
        onApiKeyChange={setApiKey}
        onSave={(event) => void save(event)}
        onSaveCredential={() =>
          void perform(
            "credential",
            async () => {
              const next = await modelConnectionsApi.setCredential(
                connection.id,
                apiKey.trim()
              );
              setApiKey("");
              return next;
            },
            content.credential.saved
          )
        }
        onClearCredential={() => setConfirmAction("clear-credential")}
      />
      <ModelCatalog
        connection={connection}
        selectedModelId={selectedModelId}
        manualModelId={manualModelId}
        busyAction={busyAction}
        onSelectedModelIdChange={setSelectedModelId}
        onManualModelIdChange={setManualModelId}
        onDiscover={() =>
          void perform("discover", async () => {
            await refreshAfter(() => modelConnectionsApi.discover(connection.id));
          }, content.catalog.refreshStarted)
        }
        onAddManualModel={() =>
          void perform("manual-add", async () => {
            await refreshAfter(() =>
              modelConnectionsApi.addManualModel(connection.id, manualModelId.trim())
            );
            setManualModelId("");
          }, content.catalog.manualAdded)
        }
        onDeleteManualModel={(modelId) =>
          void perform("manual-delete", async () => {
            await refreshAfter(() => modelConnectionsApi.deleteManualModel(connection.id, modelId));
          }, content.catalog.manualRemoved)
        }
        onToggleModel={(modelId, enabled) =>
          void perform("model-enable", async () => {
            const ids = enabled
              ? [...connection.enabled_model_ids, modelId]
              : connection.enabled_model_ids.filter((id) => id !== modelId);
            return modelConnectionsApi.update(connection.id, { enabled_model_ids: ids });
          })
        }
        onTest={(mode) =>
          void perform(`test-${mode}`, async () => {
            const result = await modelConnectionsApi.test(connection.id, selectedModelId, mode);
            await refreshAfter(async () => result);
            if (result.status === "passed") {
              toast.success(content.catalog.testSucceeded(result.model_id, result.latency_ms));
            } else {
              setActionError(
                providerErrorLabel(result.error_code) ?? content.catalog.testFailed
              );
            }
          })
        }
      />

      <section className="model-settings-card">
        <div className="model-settings-card__heading">
          <h2>{content.sections.defaults}</h2>
          <p>{content.defaults.description}</p>
        </div>
        <div className="model-defaults-row">
          <label className="model-settings-field">
            <span>{content.defaults.model}</span>
            <select
              value={connection.default_model_id ?? ""}
              disabled={busyAction !== null}
              onChange={(event) =>
                void perform("default-model", () =>
                  modelConnectionsApi.update(connection.id, {
                    default_model_id: event.target.value || null
                  })
                )
              }
            >
              <option value="">{content.defaults.noModel}</option>
              {connection.default_model_id !== null &&
              !usableDefaults.some((entry) => entry.model_id === connection.default_model_id) ? (
                <option value={connection.default_model_id} disabled>
                  {content.defaults.unavailableModel(connection.default_model_id)}
                </option>
              ) : null}
              {usableDefaults.map((entry) => (
                <option key={entry.model_id} value={entry.model_id}>
                  {entry.model_id}
                </option>
              ))}
            </select>
            <small>{content.defaults.modelHelp}</small>
          </label>
          <div className="model-default-connection">
            <div>
              <span>{content.defaults.connection}</span>
              <small>{content.defaults.connectionHelp}</small>
            </div>
            <Button
              type="button"
              size="sm"
              variant={connection.is_default ? "outline" : "default"}
              disabled={busyAction !== null}
              onClick={() =>
                void perform(
                  "default-connection",
                  () =>
                    connection.is_default
                      ? modelConnectionsApi.update(connection.id, { is_default: false })
                      : modelConnectionsApi.setDefault(connection.id),
                  connection.is_default ? content.defaults.cleared : content.defaults.set
                )
              }
            >
              {connection.is_default ? content.defaults.clearConnection : content.defaults.setConnection}
            </Button>
          </div>
        </div>
      </section>

      <section className="model-settings-card model-settings-card--danger">
        <div className="model-settings-card__heading">
          <h2>{content.sections.danger}</h2>
          <p>{content.danger.description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={busyAction !== null}
          onClick={() => setConfirmAction("delete")}
        >
          <Trash2 className="size-3.5" />
          {content.danger.delete}
        </Button>
      </section>

      {connection.discovery.error_code ? (
        <span className="sr-only">{providerErrorLabel(connection.discovery.error_code)}</span>
      ) : null}

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {confirmAction === "delete" ? content.danger.deleteTitle : content.credential.clearTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmAction === "delete"
              ? content.danger.deleteDescription(connection.display_name)
              : content.credential.clearDescription}
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button variant="outline">{content.cancel}</Button>
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                const action = confirmAction;
                setConfirmAction(null);
                if (action === "delete") {
                  void perform("delete", async () => {
                    await modelConnectionsApi.delete(connection.id);
                    await queryClient.invalidateQueries({ queryKey: ["model-connections"] });
                    void navigate("/settings/models", { replace: true });
                  }, content.danger.deleted);
                } else if (action === "clear-credential") {
                  void perform("clear-credential", () =>
                    modelConnectionsApi.clearCredential(connection.id), content.credential.cleared
                  );
                }
              }}
            >
              {confirmAction === "delete" ? content.danger.confirmDelete : content.credential.confirmClear}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPageWrapper>
  );
}

function toDraft(connection: ModelConnection): ConnectionDraft {
  return {
    displayName: connection.display_name,
    baseUrl: connection.base_url,
    authMode: connection.auth_mode,
    enabled: connection.enabled,
    maxTokensField: connection.max_tokens_field,
    includeUsage: connection.include_usage
  };
}
