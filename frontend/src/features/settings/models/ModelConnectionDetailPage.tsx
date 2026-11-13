import { useNavigation } from "@/app/navigation";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  modelConnectionsApi,
  type ModelConnection,
  type ModelProtocol,
} from "@/features/settings/models/api";
import {
  connectionErrorMessage,
  connectionStatus,
  providerErrorLabel,
} from "@/features/settings/models/model";
import {
  EnabledModelSelector,
  ModelDetailSection,
  ModelExpandableRow,
} from "@/features/settings/models/ModelConnectionDetailControls";
import { ModelRetryPolicySettings } from "@/features/settings/models/ModelRetryPolicySettings";
import { ModelSettings } from "@/features/settings/models/ModelSettings";
import { providerName } from "@/features/settings/models/provider-copy";
import { ProviderLogo } from "@/features/settings/models/ProviderLogo";
import { protocolsForProvider } from "@/features/settings/models/providers";
import {
  SettingsPageHeader,
  SettingsPageWrapper,
} from "@/features/settings/SettingsPage";
import { refSetter, watchMounted } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { Check, LoaderCircle } from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";
const content = zhCN.modelConnections;
export const ModelConnectionDetailPage = defineComponent(
  (_props, { slots: _slots }) => {
    const _route = useRoute(),
      connectionId = computed(() =>
        _route.params.connectionId === undefined
          ? undefined
          : String(_route.params.connectionId),
      );
    if (connectionId.value === undefined)
      throw new Error("Model connection route requires an identifier.");
    const resolvedConnectionId = connectionId.value;
    const navigate = useNavigation();
    const queryClient = useQueryClient();
    const queryKey = ["model-connections", resolvedConnectionId] as const;
    const query = reactive(
      useQuery(
        computed(() => ({
          queryKey,
          queryFn: () => modelConnectionsApi.get(resolvedConnectionId),
          refetchInterval: (state: {
            state: { data: ModelConnection | undefined };
          }) =>
            state.state.data?.discovery.status === "pending" ? 1200 : false,
        })),
      ),
    );
    const connection = computed(() => query.data);
    const apiKey = shallowRef(""),
      setApiKey = refSetter(apiKey);
    const baseUrl = shallowRef(""),
      setBaseUrl = refSetter(baseUrl);
    const editingRow = shallowRef<"credential" | "endpoint" | null>(null),
      setEditingRow = refSetter(editingRow);
    const busyAction = shallowRef<string | null>(null),
      setBusyAction = refSetter(busyAction);
    const actionError = shallowRef<string | null>(null),
      setActionError = refSetter(actionError);
    const confirmDelete = shallowRef(false),
      setConfirmDelete = refSetter(confirmDelete);
    const actionRunning = shallowRef(false);
    watchMounted([() => connection.value, () => editingRow.value], () => {
      if (connection.value !== undefined && editingRow.value !== "endpoint")
        setBaseUrl(connection.value.base_url);
    });
    function publish(next: ModelConnection) {
      queryClient.setQueryData(queryKey, next);
      void queryClient.invalidateQueries({
        queryKey: ["model-connections"],
        exact: true,
      });
    }
    async function perform(
      name: string,
      operation: () => Promise<ModelConnection | void>,
      successMessage?: string,
    ) {
      if (actionRunning.value) return false;
      actionRunning.value = true;
      setBusyAction(name);
      setActionError(null);
      try {
        const next = await operation();
        if (next !== undefined) publish(next);
        if (successMessage !== undefined) toast.success(successMessage);
        return true;
      } catch (error) {
        setActionError(connectionErrorMessage(error));
        console.error("[models] Connection update failed.", {
          connectionId: resolvedConnectionId,
          action: name,
          error,
        });
        return false;
      } finally {
        actionRunning.value = false;
        setBusyAction(null);
      }
    }
    async function refreshConnection(operation: () => Promise<unknown>) {
      await operation();
      const next = await modelConnectionsApi.get(resolvedConnectionId);
      publish(next);
    }
    return () => {
      const _connection = connection.value;
      if (query.isLoading || _connection === undefined) {
        return (
          <SettingsPageWrapper>
            <SettingsPageHeader
              title={content.title}
              description={content.description}
              actions={null}
            />
            {query.isError ? (
              <div class="model-notice model-notice--error" role="alert">
                <span>{connectionErrorMessage(query.error)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void query.refetch()}
                >
                  {content.retry}
                </Button>
              </div>
            ) : (
              <div class="model-loading">
                <LoaderCircle class="size-5 animate-spin" />
                {content.detail.loading}
              </div>
            )}
          </SettingsPageWrapper>
        );
      }
      const _status = connectionStatus(_connection);
      const _availableEntries = _connection.entries.filter(
        (entry) =>
          entry.revision === _connection.revision &&
          entry.availability === "available",
      );
      const _selectableEntries = _connection.entries.filter(
        (entry) =>
          (entry.revision === _connection.revision &&
            entry.availability === "available") ||
          entry.enabled,
      );
      const _usableEntries = _availableEntries.filter(
        (entry) =>
          entry.enabled &&
          entry.checks.text.status === "passed" &&
          entry.checks.tools.status === "passed",
      );
      const _testModelId =
        _connection.default_model_id ??
        _availableEntries.find((entry) => entry.enabled)?.model_id ??
        _availableEntries[0]?.model_id ??
        "";
      const _showsEndpoint = [
        "deepseek",
        "openai",
        "custom",
        "ollama",
        "lm_studio",
        "localai",
      ].includes(_connection.provider_type);
      return (
        <SettingsPageWrapper>
          <SettingsPageHeader
            title={content.title}
            description={content.description}
            actions={null}
          />
          <div class="model-route-page model-detail">
            <div class="model-route-header">
              <button
                type="button"
                class="model-route-header__back"
                onClick={() => void navigate("/settings/models")}
              >
                {content.backToList}
              </button>
              <div class="model-route-header__identity">
                <ProviderLogo type={_connection.provider_type} compact />
                <div>
                  <div class="model-route-header__title-line">
                    <h2>{_connection.display_name}</h2>
                    {_connection.is_default ? (
                      <span class="model-badge">{content.defaultBadge}</span>
                    ) : null}
                  </div>
                  <p>
                    {[
                      providerName[_connection.provider_type],
                      _connection.default_model_id,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
            </div>

            {actionError.value !== null ? (
              <div class="model-notice model-notice--error" role="alert">
                {actionError.value}
              </div>
            ) : null}
            {_status.tone !== "ready" ? (
              <div class="model-notice" role="status">
                <span class={`model-status model-status--${_status.tone}`}>
                  <span class="model-status__dot" />
                  {_status.label}
                </span>
              </div>
            ) : null}

            <ModelDetailSection
              title={content.detail.credentials}
              description={content.detail.credentialsHelp}
            >
              {_connection.provider_type === "custom" ? (
                <label class="provider-form-field">
                  <span>{content.detail.protocol}</span>
                  <select
                    value={_connection.protocol}
                    disabled={busyAction.value !== null}
                    onChange={(event) => {
                      const protocol = (event.target as HTMLInputElement)
                        .value as ModelProtocol;
                      const official =
                        _connection.provider_type === "deepseek" &&
                        (_connection.base_url === "https://api.deepseek.com" ||
                          _connection.base_url ===
                            "https://api.deepseek.com/anthropic");
                      void perform("protocol", () =>
                        modelConnectionsApi.update(_connection.id, {
                          protocol,
                          max_tokens_field:
                            protocol === "openai_compatible" &&
                            _connection.provider_type === "openai"
                              ? "max_completion_tokens"
                              : "max_tokens",
                          include_usage: false,
                          ...(official
                            ? {
                                base_url:
                                  protocol === "deepseek_messages"
                                    ? "https://api.deepseek.com/anthropic"
                                    : "https://api.deepseek.com",
                              }
                            : {}),
                        }),
                      );
                    }}
                  >
                    {protocolsForProvider(_connection.provider_type).map(
                      (value) => (
                        <option key={value} value={value}>
                          {content.protocols[value]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              ) : null}
              {_connection.auth_mode === "api_key" ? (
                <ModelExpandableRow
                  label={content.detail.modelKey}
                  value={
                    _connection.credential.configured
                      ? content.detail.keySet
                      : content.detail.keyMissing
                  }
                  actionLabel={
                    _connection.credential.configured
                      ? content.detail.change
                      : content.detail.set
                  }
                  editing={editingRow.value === "credential"}
                  busy={busyAction.value !== null}
                  canSave={apiKey.value.trim() !== ""}
                  onEdit={() => {
                    setEditingRow("credential");
                    setApiKey("");
                  }}
                  onCancel={() => {
                    setEditingRow(null);
                    setApiKey("");
                  }}
                  onSave={() =>
                    void perform(
                      "credential",
                      async () => {
                        const next = await modelConnectionsApi.setCredential(
                          _connection.id,
                          apiKey.value.trim(),
                        );
                        setEditingRow(null);
                        setApiKey("");
                        return next;
                      },
                      content.detail.keySaved,
                    )
                  }
                >
                  <Input
                    autofocus
                    type="password"
                    autocomplete="new-password"
                    value={apiKey.value}
                    placeholder={content.create.apiKeyPlaceholder}
                    disabled={busyAction.value !== null}
                    onInput={(event) =>
                      setApiKey((event.target as HTMLInputElement).value)
                    }
                  />
                </ModelExpandableRow>
              ) : (
                <div class="model-detail__quiet">
                  {content.detail.noCredential}
                </div>
              )}
              {_showsEndpoint ? (
                <ModelExpandableRow
                  label={content.detail.endpoint}
                  value={_connection.base_url}
                  actionLabel={content.detail.edit}
                  editing={editingRow.value === "endpoint"}
                  busy={busyAction.value !== null}
                  canSave={
                    baseUrl.value.trim() !== "" &&
                    baseUrl.value.trim() !== _connection.base_url
                  }
                  onEdit={() => {
                    setEditingRow("endpoint");
                    setBaseUrl(_connection.base_url);
                  }}
                  onCancel={() => {
                    setEditingRow(null);
                    setBaseUrl(_connection.base_url);
                  }}
                  onSave={() =>
                    void perform(
                      "endpoint",
                      async () => {
                        const next = await modelConnectionsApi.update(
                          _connection.id,
                          {
                            base_url: baseUrl.value,
                          },
                        );
                        setEditingRow(null);
                        return next;
                      },
                      content.saved,
                    )
                  }
                >
                  <Input
                    autofocus
                    type="url"
                    value={baseUrl.value}
                    disabled={busyAction.value !== null}
                    onInput={(event) =>
                      setBaseUrl((event.target as HTMLInputElement).value)
                    }
                  />
                </ModelExpandableRow>
              ) : null}
            </ModelDetailSection>

            <ModelDetailSection
              title={content.detail.models}
              description={content.detail.modelsHelp}
            >
              <EnabledModelSelector
                entries={_selectableEntries}
                enabledIds={_connection.enabled_model_ids}
                disabled={busyAction.value !== null}
                onChange={(ids) =>
                  void perform("enabled-models", () =>
                    modelConnectionsApi.update(_connection.id, {
                      enabled_model_ids: ids,
                    }),
                  )
                }
              />
              <label class="provider-form-field">
                <span>{content.detail.defaultModel}</span>
                <select
                  value={_connection.default_model_id ?? ""}
                  disabled={busyAction.value !== null}
                  onChange={(event) =>
                    void perform("default-model", () =>
                      modelConnectionsApi.update(_connection.id, {
                        default_model_id:
                          (event.target as HTMLInputElement).value || null,
                      }),
                    )
                  }
                >
                  <option value="">{content.detail.noDefaultModel}</option>
                  {_usableEntries.map((entry) => (
                    <option key={entry.model_id} value={entry.model_id}>
                      {entry.display_name || entry.model_id}
                    </option>
                  ))}
                </select>
              </label>
              <div class="model-detail__actions">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={
                    busyAction.value !== null ||
                    _testModelId === "" ||
                    _connection.credential.status !== "ready"
                  }
                  onClick={() =>
                    void perform(
                      "test",
                      async () => {
                        const result = await modelConnectionsApi.test(
                          _connection.id,
                          _testModelId,
                          "tools",
                        );
                        await refreshConnection(async () => result);
                        if (result.status !== "passed") {
                          throw new Error(
                            providerErrorLabel(result.error_code) ??
                              content.detail.testFailed,
                          );
                        }
                      },
                      content.detail.testSucceeded,
                    )
                  }
                >
                  {busyAction.value === "test" ? (
                    <LoaderCircle class="size-3.5 animate-spin" />
                  ) : null}
                  {content.detail.test}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={
                    busyAction.value !== null ||
                    _connection.credential.status !== "ready"
                  }
                  onClick={() =>
                    void perform(
                      "discover",
                      () =>
                        refreshConnection(() =>
                          modelConnectionsApi.discover(_connection.id),
                        ),
                      content.detail.modelsUpdated,
                    )
                  }
                >
                  {busyAction.value === "discover" ||
                  _connection.discovery.status === "pending" ? (
                    <LoaderCircle class="size-3.5 animate-spin" />
                  ) : null}
                  {content.detail.updateModels}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyAction.value !== null || _connection.is_default}
                  onClick={() =>
                    void perform(
                      "default-connection",
                      () => modelConnectionsApi.setDefault(_connection.id),
                      content.detail.defaultSet,
                    )
                  }
                >
                  {_connection.is_default ? <Check class="size-3.5" /> : null}
                  {_connection.is_default
                    ? content.detail.defaultConnection
                    : content.detail.setDefaultConnection}
                </Button>
              </div>
            </ModelDetailSection>

            <ModelDetailSection
              title={content.modelSettings.title}
              description={content.modelSettings.description}
            >
              <ModelSettings
                protocol={_connection.protocol}
                entries={_availableEntries.filter((entry) => entry.enabled)}
                disabled={busyAction.value !== null}
                onSave={(modelId, input) =>
                  perform(
                    "model-settings",
                    () =>
                      refreshConnection(() =>
                        modelConnectionsApi.setModelSettings(
                          _connection.id,
                          modelId,
                          input,
                        ),
                      ),
                    content.saved,
                  )
                }
              />
            </ModelDetailSection>

            <ModelRetryPolicySettings
              connection={_connection}
              disabled={busyAction.value !== null}
              onSave={(policy) =>
                perform(
                  "retry",
                  () =>
                    modelConnectionsApi.update(_connection.id, {
                      retry_policy: policy,
                    }),
                  content.saved,
                )
              }
            />
            <ModelDetailSection
              title={content.detail.danger}
              description={content.detail.dangerHelp}
            >
              <div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busyAction.value !== null}
                  onClick={() => setConfirmDelete(true)}
                >
                  {content.detail.delete}
                </Button>
              </div>
            </ModelDetailSection>
          </div>

          <AlertDialog
            open={confirmDelete.value}
            onUpdate:open={setConfirmDelete}
          >
            <AlertDialogContent>
              <AlertDialogTitle>
                {content.detail.deleteTitle(_connection.display_name)}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {content.detail.deleteDescription}
              </AlertDialogDescription>
              <div class="flex justify-end gap-2">
                <AlertDialogCancel>{content.cancel}</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={busyAction.value !== null}
                  onClick={() =>
                    void perform("delete", async () => {
                      if (_connection.is_default)
                        await modelConnectionsApi.update(_connection.id, {
                          is_default: false,
                        });
                      await modelConnectionsApi.delete(_connection.id);
                      await queryClient.invalidateQueries({
                        queryKey: ["model-connections"],
                      });
                      setConfirmDelete(false);
                      void navigate("/settings/models", {
                        replace: true,
                      });
                    })
                  }
                >
                  {busyAction.value === "delete" ? (
                    <LoaderCircle class="size-3.5 animate-spin" />
                  ) : null}
                  {content.detail.delete}
                </Button>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </SettingsPageWrapper>
      );
    };
  },
  {
    name: "ModelConnectionDetailPage",
    inheritAttrs: false,
    props: [],
  },
);
