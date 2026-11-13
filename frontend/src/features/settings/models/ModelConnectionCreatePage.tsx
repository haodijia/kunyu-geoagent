import { useNavigation } from "@/app/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  modelConnectionsApi,
  type ModelProtocol,
  type ModelProviderType,
} from "@/features/settings/models/api";
import { connectionErrorMessage } from "@/features/settings/models/model";
import { displayForProvider } from "@/features/settings/models/provider-copy";
import { ProviderLogo } from "@/features/settings/models/ProviderLogo";
import {
  protocolsForProvider,
  providerById,
} from "@/features/settings/models/providers";
import {
  SettingsPageHeader,
  SettingsPageWrapper,
} from "@/features/settings/SettingsPage";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useQueryClient } from "@tanstack/vue-query";
import { LoaderCircle } from "lucide-vue-next";
import { computed, defineComponent, shallowRef, type VNodeChild } from "vue";
import { useRoute } from "vue-router";
const content = zhCN.modelConnections;
export const ModelConnectionCreatePage = defineComponent(
  (_props, { slots: _slots }) => {
    const _route = useRoute(),
      providerId = computed(() =>
        _route.params.providerId === undefined
          ? undefined
          : String(_route.params.providerId),
      );
    const provider = providerById(providerId.value ?? "");
    if (provider === undefined) {
      throw new Error(`Unknown model provider '${providerId.value ?? ""}'.`);
    }
    const selectedProvider = provider;
    const display = displayForProvider(selectedProvider);
    const navigate = useNavigation();
    const queryClient = useQueryClient();
    const name = shallowRef(display.name),
      setName = refSetter(name);
    const protocol = shallowRef<ModelProtocol>(selectedProvider.protocol),
      setProtocol = refSetter(protocol);
    const baseUrl = shallowRef(selectedProvider.baseUrl),
      setBaseUrl = refSetter(baseUrl);
    const apiKey = shallowRef(""),
      setApiKey = refSetter(apiKey);
    const createdConnectionId = shallowRef<string | null>(null),
      setCreatedConnectionId = refSetter(createdConnectionId);
    const busy = shallowRef(false),
      setBusy = refSetter(busy);
    const error = shallowRef<string | null>(null),
      setError = refSetter(error);
    const submitting = shallowRef(false);
    const customSetup =
      selectedProvider.providerType === "custom" ||
      selectedProvider.category === "local";
    const requiresApiKey = selectedProvider.authMode === "api_key";
    const invalid = computed(
      () =>
        name.value.trim() === "" ||
        baseUrl.value.trim() === "" ||
        (requiresApiKey && apiKey.value.trim() === ""),
    );
    async function submit(event: SubmitEvent) {
      event.preventDefault();
      if (submitting.value || invalid.value) return;
      submitting.value = true;
      setBusy(true);
      setError(null);
      try {
        let connectionId = createdConnectionId.value;
        if (connectionId === null) {
          const connection = await modelConnectionsApi.create({
            display_name: name.value,
            provider_type: selectedProvider.providerType,
            protocol: protocol.value,
            base_url: baseUrl.value,
            auth_mode: selectedProvider.authMode,
            max_tokens_field:
              protocol.value === "deepseek_messages"
                ? "max_tokens"
                : selectedProvider.maxTokensField,
            include_usage: selectedProvider.includeUsage,
          });
          connectionId = connection.id;
          setCreatedConnectionId(connection.id);
        }
        if (requiresApiKey) {
          await modelConnectionsApi.setCredential(
            connectionId,
            apiKey.value.trim(),
          );
        }
        await queryClient.invalidateQueries({
          queryKey: ["model-connections"],
        });
        void navigate(`/settings/models/${connectionId}`, {
          replace: true,
        });
      } catch (requestError) {
        setError(connectionErrorMessage(requestError));
      } finally {
        submitting.value = false;
        setBusy(false);
      }
    }
    return () => {
      const _invalid = invalid.value;
      return (
        <SettingsPageWrapper>
          <SettingsPageHeader
            title={content.title}
            description={content.description}
            actions={null}
          />
          <div class="model-route-page">
            <RouteHeader
              onBack={() => void navigate("/settings/models/new")}
              backLabel={content.catalog.back}
              providerType={selectedProvider.providerType}
              title={content.create.connect(display.name)}
              subtitle={content.create.subtitle}
              badge={display.badge}
            />

            <form
              class="provider-setup-form"
              onSubmit={(event) => void submit(event)}
            >
              {protocolsForProvider(selectedProvider.providerType).length >
              1 ? (
                <FormField label={content.create.protocol}>
                  <select
                    value={protocol.value}
                    disabled={busy.value || createdConnectionId.value !== null}
                    onChange={(event) =>
                      setProtocol(
                        (event.target as HTMLInputElement)
                          .value as ModelProtocol,
                      )
                    }
                  >
                    {protocolsForProvider(selectedProvider.providerType).map(
                      (value) => (
                        <option key={value} value={value}>
                          {content.protocols[value]}
                        </option>
                      ),
                    )}
                  </select>
                </FormField>
              ) : null}
              {customSetup ? (
                <>
                  {requiresApiKey ? (
                    <FormField label={content.create.apiKey}>
                      <Input
                        autofocus
                        type="password"
                        autocomplete="new-password"
                        value={apiKey.value}
                        placeholder={content.create.apiKeyPlaceholder}
                        disabled={busy.value}
                        onInput={(event) =>
                          setApiKey((event.target as HTMLInputElement).value)
                        }
                      />
                    </FormField>
                  ) : null}
                  <FormField label={content.create.name}>
                    <Input
                      autofocus={!requiresApiKey}
                      value={name.value}
                      maxlength={200}
                      disabled={
                        busy.value || createdConnectionId.value !== null
                      }
                      onInput={(event) =>
                        setName((event.target as HTMLInputElement).value)
                      }
                    />
                  </FormField>
                  <FormField label={content.create.endpoint}>
                    <Input
                      type="url"
                      value={baseUrl.value}
                      maxlength={2048}
                      placeholder="https://api.example.com/v1"
                      disabled={
                        busy.value || createdConnectionId.value !== null
                      }
                      onInput={(event) =>
                        setBaseUrl((event.target as HTMLInputElement).value)
                      }
                    />
                  </FormField>
                </>
              ) : (
                <FormField label={content.create.apiKey}>
                  <Input
                    autofocus
                    type="password"
                    autocomplete="new-password"
                    value={apiKey.value}
                    placeholder={content.create.apiKeyPlaceholder}
                    disabled={busy.value}
                    onInput={(event) =>
                      setApiKey((event.target as HTMLInputElement).value)
                    }
                  />
                </FormField>
              )}

              {error.value !== null ? (
                <div class="model-notice model-notice--error" role="alert">
                  {error.value}
                </div>
              ) : null}

              <div class="provider-setup-form__actions">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy.value}
                  onClick={() => void navigate("/settings/models/new")}
                >
                  {content.cancel}
                </Button>
                <Button type="submit" disabled={busy.value || _invalid}>
                  {busy.value ? (
                    <LoaderCircle class="size-4 animate-spin" />
                  ) : null}
                  {busy.value ? content.create.saving : content.create.save}
                </Button>
              </div>
            </form>
          </div>
        </SettingsPageWrapper>
      );
    };
  },
  {
    name: "ModelConnectionCreatePage",
    inheritAttrs: false,
    props: [],
  },
);
const FormField = defineComponent(
  (
    componentProps: {
      readonly label: string;
      readonly children?: VNodeChild;
    },
    { slots },
  ) => {
    const label = computed(() => componentProps.label),
      children = () => slots.default?.();
    return () => {
      const _label = label.value;
      return (
        <label class="provider-form-field">
          <span>{_label}</span>
          {children()}
        </label>
      );
    };
  },
  {
    name: "FormField",
    inheritAttrs: false,
    props: ["label"],
  },
);
const RouteHeader = defineComponent(
  (
    componentProps: {
      readonly onBack: () => void;
      readonly backLabel: string;
      readonly providerType: ModelProviderType;
      readonly title: string;
      readonly subtitle: string;
      readonly badge: string;
    },
    { slots: _slots },
  ) => {
    const onBack = computed(() => componentProps.onBack),
      backLabel = computed(() => componentProps.backLabel),
      providerType = computed(() => componentProps.providerType),
      title = computed(() => componentProps.title),
      subtitle = computed(() => componentProps.subtitle),
      badge = computed(() => componentProps.badge);
    return () => {
      const _onBack = onBack.value,
        _backLabel = backLabel.value,
        _providerType = providerType.value,
        _title = title.value,
        _badge = badge.value,
        _subtitle = subtitle.value;
      return (
        <div class="model-route-header">
          <button
            type="button"
            class="model-route-header__back"
            onClick={_onBack}
          >
            {_backLabel}
          </button>
          <div class="model-route-header__identity">
            <ProviderLogo type={_providerType} compact />
            <div>
              <div class="model-route-header__title-line">
                <h2>{_title}</h2>
                <span class="model-badge">{_badge}</span>
              </div>
              <p>{_subtitle}</p>
            </div>
          </div>
        </div>
      );
    };
  },
  {
    name: "RouteHeader",
    inheritAttrs: false,
    props: [
      "onBack",
      "backLabel",
      "providerType",
      "title",
      "subtitle",
      "badge",
    ],
  },
);
