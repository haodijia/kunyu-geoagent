import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsPageHeader, SettingsPageWrapper } from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";
import { modelConnectionsApi, type ModelProtocol, type ModelProviderType } from "./api";
import { connectionErrorMessage } from "./model";
import { displayForProvider } from "./provider-copy";
import { ProviderLogo } from "./ProviderLogo";
import { providerById } from "./providers";

const content = zhCN.modelConnections;

export function ModelConnectionCreatePage() {
  const { providerId } = useParams();
  const provider = providerById(providerId ?? "");
  if (provider === undefined) {
    throw new Error(`Unknown model provider '${providerId ?? ""}'.`);
  }
  const selectedProvider = provider;
  const display = displayForProvider(selectedProvider);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(display.name);
  const [protocol, setProtocol] = useState<ModelProtocol>(selectedProvider.protocol);
  const [baseUrl, setBaseUrl] = useState(selectedProvider.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [createdConnectionId, setCreatedConnectionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const customSetup = selectedProvider.providerType === "custom" || selectedProvider.category === "local";
  const requiresApiKey = selectedProvider.authMode === "api_key";
  const invalid = name.trim() === "" || baseUrl.trim() === "" || (requiresApiKey && apiKey.trim() === "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || invalid) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      let connectionId = createdConnectionId;
      if (connectionId === null) {
        const connection = await modelConnectionsApi.create({
          display_name: name,
          provider_type: selectedProvider.providerType,
          protocol,
          base_url: baseUrl,
          auth_mode: selectedProvider.authMode,
          max_tokens_field: protocol === "deepseek_messages" ? "max_tokens" : selectedProvider.maxTokensField,
          include_usage: selectedProvider.includeUsage
        });
        connectionId = connection.id;
        setCreatedConnectionId(connection.id);
      }
      if (requiresApiKey) {
        await modelConnectionsApi.setCredential(connectionId, apiKey.trim());
      }
      await queryClient.invalidateQueries({ queryKey: ["model-connections"] });
      void navigate(`/settings/models/${connectionId}`, { replace: true });
    } catch (requestError) {
      setError(connectionErrorMessage(requestError));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <SettingsPageWrapper>
      <SettingsPageHeader title={content.title} description={content.description} actions={null} />
      <div className="model-route-page">
        <RouteHeader
          onBack={() => void navigate("/settings/models/new")}
          backLabel={content.catalog.back}
          providerType={selectedProvider.providerType}
          title={content.create.connect(display.name)}
          subtitle={content.create.subtitle}
          badge={display.badge}
        />

        <form className="provider-setup-form" onSubmit={(event) => void submit(event)}>
          {selectedProvider.providerType === "custom" ? (
            <FormField label={content.create.protocol}>
              <select value={protocol} disabled={busy || createdConnectionId !== null} onChange={(event) => setProtocol(event.target.value as ModelProtocol)}>
                {Object.entries(content.protocols).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </FormField>
          ) : null}
          {customSetup ? (
            <>
              {requiresApiKey ? (
                <FormField label={content.create.apiKey}>
                  <Input
                    autoFocus
                    type="password"
                    autoComplete="new-password"
                    value={apiKey}
                    placeholder={content.create.apiKeyPlaceholder}
                    disabled={busy}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </FormField>
              ) : null}
              <FormField label={content.create.name}>
                <Input
                  autoFocus={!requiresApiKey}
                  value={name}
                  maxLength={200}
                  disabled={busy || createdConnectionId !== null}
                  onChange={(event) => setName(event.target.value)}
                />
              </FormField>
              <FormField label={content.create.endpoint}>
                <Input
                  type="url"
                  value={baseUrl}
                  maxLength={2048}
                  placeholder="https://api.example.com/v1"
                  disabled={busy || createdConnectionId !== null}
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </FormField>
            </>
          ) : (
            <FormField label={content.create.apiKey}>
              <Input
                autoFocus
                type="password"
                autoComplete="new-password"
                value={apiKey}
                placeholder={content.create.apiKeyPlaceholder}
                disabled={busy}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </FormField>
          )}

          {error !== null ? (
            <div className="model-notice model-notice--error" role="alert">{error}</div>
          ) : null}

          <div className="provider-setup-form__actions">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void navigate("/settings/models/new")}>
              {content.cancel}
            </Button>
            <Button type="submit" disabled={busy || invalid}>
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {busy ? content.create.saving : content.create.save}
            </Button>
          </div>
        </form>
      </div>
    </SettingsPageWrapper>
  );
}

function FormField({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="provider-form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function RouteHeader({
  onBack,
  backLabel,
  providerType,
  title,
  subtitle,
  badge
}: {
  readonly onBack: () => void;
  readonly backLabel: string;
  readonly providerType: ModelProviderType;
  readonly title: string;
  readonly subtitle: string;
  readonly badge: string;
}) {
  return (
    <div className="model-route-header">
      <button type="button" className="model-route-header__back" onClick={onBack}>{backLabel}</button>
      <div className="model-route-header__identity">
        <ProviderLogo type={providerType} compact />
        <div>
          <div className="model-route-header__title-line">
            <h2>{title}</h2>
            <span className="model-badge">{badge}</span>
          </div>
          <p>{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
