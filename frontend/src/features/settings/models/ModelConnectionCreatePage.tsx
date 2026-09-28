import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  SettingsPageHeader,
  SettingsPageWrapper
} from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";
import {
  modelConnectionsApi,
  type MaxTokensField,
  type ModelAuthMode
} from "./api";
import { connectionErrorMessage } from "./model";

const content = zhCN.modelConnections;

export function ModelConnectionCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [authMode, setAuthMode] = useState<ModelAuthMode>("api_key");
  const [apiKey, setApiKey] = useState("");
  const [maxTokensField, setMaxTokensField] =
    useState<MaxTokensField>("max_tokens");
  const [includeUsage, setIncludeUsage] = useState(false);
  const [createdConnectionId, setCreatedConnectionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const keyRequired = authMode === "api_key";
  const invalid =
    displayName.trim() === "" ||
    baseUrl.trim() === "" ||
    (keyRequired && apiKey.trim() === "");

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
          display_name: displayName,
          protocol: "openai_compatible",
          base_url: baseUrl,
          auth_mode: authMode,
          max_tokens_field: maxTokensField,
          include_usage: includeUsage
        });
        connectionId = connection.id;
        setCreatedConnectionId(connection.id);
      }
      if (keyRequired) {
        await modelConnectionsApi.setCredential(connectionId, apiKey.trim());
      }
      setApiKey("");
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
      <SettingsPageHeader
        title={content.create.title}
        description={content.create.description}
        actions={
          <Button variant="ghost" size="sm" onClick={() => void navigate("/settings/models")}>
            <ArrowLeft className="size-3.5" />
            {content.backToList}
          </Button>
        }
      />

      <form className="model-settings-form" onSubmit={(event) => void submit(event)}>
        {createdConnectionId !== null && error !== null ? (
          <div className="model-settings-notice model-settings-notice--warning" role="status">
            {content.create.savedCredentialFailed}
          </div>
        ) : null}
        {error !== null ? (
          <div className="model-settings-notice model-settings-notice--error" role="alert">
            {error}
          </div>
        ) : null}

        <section className="model-settings-card">
          <div className="model-settings-card__heading">
            <h2>{content.sections.connection}</h2>
            <p>{content.create.connectionHelp}</p>
          </div>
          <div className="model-settings-fields">
            <label className="model-settings-field">
              <span>{content.fields.displayName}</span>
              <Input
                autoFocus
                maxLength={200}
                value={displayName}
                disabled={createdConnectionId !== null}
                placeholder={content.fields.displayNamePlaceholder}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="model-settings-field">
              <span>{content.fields.protocol}</span>
              <select value="openai_compatible" disabled>
                <option value="openai_compatible">OpenAI Compatible</option>
              </select>
              <small>{content.fields.protocolHelp}</small>
            </label>
            <label className="model-settings-field model-settings-field--wide">
              <span>{content.fields.baseUrl}</span>
              <Input
                type="url"
                maxLength={2048}
                value={baseUrl}
                disabled={createdConnectionId !== null}
                placeholder="https://api.example.com/v1"
                onChange={(event) => setBaseUrl(event.target.value)}
              />
              <small>{content.fields.baseUrlHelp}</small>
            </label>
            <label className="model-settings-field">
              <span>{content.fields.authMode}</span>
              <select
                value={authMode}
                disabled={createdConnectionId !== null}
                onChange={(event) => setAuthMode(event.target.value as ModelAuthMode)}
              >
                <option value="api_key">{content.auth.apiKey}</option>
                <option value="none">{content.auth.none}</option>
              </select>
            </label>
            {keyRequired ? (
              <label className="model-settings-field">
                <span>{content.fields.apiKey}</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={apiKey}
                  placeholder={content.fields.apiKeyPlaceholder}
                  onChange={(event) => setApiKey(event.target.value)}
                />
                <small>{content.fields.credentialHelp}</small>
              </label>
            ) : null}
          </div>
        </section>

        <section className="model-settings-card">
          <div className="model-settings-card__heading">
            <h2>{content.sections.request}</h2>
            <p>{content.fields.requestHelp}</p>
          </div>
          <div className="model-settings-fields">
            <label className="model-settings-field">
              <span>{content.fields.maxTokensField}</span>
              <select
                value={maxTokensField}
                disabled={createdConnectionId !== null}
                onChange={(event) =>
                  setMaxTokensField(event.target.value as MaxTokensField)
                }
              >
                <option value="max_tokens">max_tokens</option>
                <option value="max_completion_tokens">max_completion_tokens</option>
              </select>
            </label>
            <label className="model-settings-check-field">
              <Checkbox
                checked={includeUsage}
                disabled={createdConnectionId !== null}
                onCheckedChange={(checked) => setIncludeUsage(checked === true)}
              />
              <span>
                <strong>{content.fields.includeUsage}</strong>
                <small>{content.fields.includeUsageHelp}</small>
              </span>
            </label>
          </div>
        </section>

        <div className="model-settings-form__footer">
          <Button type="button" variant="ghost" onClick={() => void navigate("/settings/models")}>
            {content.cancel}
          </Button>
          <Button type="submit" disabled={busy || invalid}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {createdConnectionId === null ? content.create.submit : content.create.retryCredential}
          </Button>
        </div>
      </form>
    </SettingsPageWrapper>
  );
}
