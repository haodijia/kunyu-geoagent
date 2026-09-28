import type { FormEvent } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { zhCN } from "@/locales/zh-CN";
import type {
  MaxTokensField,
  ModelAuthMode,
  ModelConnection
} from "./api";

const content = zhCN.modelConnections;

export interface ConnectionDraft {
  readonly displayName: string;
  readonly baseUrl: string;
  readonly authMode: ModelAuthMode;
  readonly enabled: boolean;
  readonly maxTokensField: MaxTokensField;
  readonly includeUsage: boolean;
}

interface ModelConnectionFormProps {
  readonly connection: ModelConnection;
  readonly draft: ConnectionDraft;
  readonly apiKey: string;
  readonly busyAction: string | null;
  readonly onDraftChange: (draft: ConnectionDraft) => void;
  readonly onApiKeyChange: (apiKey: string) => void;
  readonly onSave: (event: FormEvent) => void;
  readonly onSaveCredential: () => void;
  readonly onClearCredential: () => void;
}

export function ModelConnectionForm({
  connection,
  draft,
  apiKey,
  busyAction,
  onDraftChange,
  onApiKeyChange,
  onSave,
  onSaveCredential,
  onClearCredential
}: ModelConnectionFormProps) {
  const saveButton = (label: string) => (
    <Button
      type="submit"
      size="sm"
      disabled={
        busyAction !== null ||
        draft.displayName.trim() === "" ||
        draft.baseUrl.trim() === ""
      }
    >
      {busyAction === "save" ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
      {label}
    </Button>
  );

  return (
    <form className="model-settings-form" onSubmit={onSave}>
      <section className="model-settings-card">
        <div className="model-settings-card__heading">
          <h2>{content.sections.connection}</h2>
          <p>{content.detail.connectionHelp}</p>
        </div>
        <div className="model-settings-fields">
          <label className="model-settings-field">
            <span>{content.fields.displayName}</span>
            <Input
              value={draft.displayName}
              maxLength={200}
              onChange={(event) => onDraftChange({ ...draft, displayName: event.target.value })}
            />
          </label>
          <label className="model-settings-field">
            <span>{content.fields.protocol}</span>
            <select value={connection.protocol} disabled>
              <option value="openai_compatible">OpenAI Compatible</option>
            </select>
          </label>
          <label className="model-settings-field model-settings-field--wide">
            <span>{content.fields.baseUrl}</span>
            <Input
              type="url"
              value={draft.baseUrl}
              maxLength={2048}
              onChange={(event) => onDraftChange({ ...draft, baseUrl: event.target.value })}
            />
            <small>{content.fields.baseUrlHelp}</small>
          </label>
          <label className="model-settings-field">
            <span>{content.fields.authMode}</span>
            <select
              value={draft.authMode}
              onChange={(event) =>
                onDraftChange({ ...draft, authMode: event.target.value as ModelAuthMode })
              }
            >
              <option value="api_key">{content.auth.apiKey}</option>
              <option value="none">{content.auth.none}</option>
            </select>
          </label>
          <label className="model-settings-check-field">
            <Checkbox
              checked={draft.enabled}
              onCheckedChange={(checked) =>
                onDraftChange({ ...draft, enabled: checked === true })
              }
            />
            <span>
              <strong>{content.fields.enabled}</strong>
              <small>{content.fields.enabledHelp}</small>
            </span>
          </label>
        </div>
        <div className="model-settings-card__footer">
          {saveButton(content.saveConnection)}
        </div>
      </section>

      <section className="model-settings-card">
        <div className="model-settings-card__heading">
          <h2>{content.sections.credential}</h2>
          <p>{content.credential.description}</p>
        </div>
        <div className="model-credential-state">
          <div>
            <span>{content.credential.state}</span>
            <strong>{content.credential.status[connection.credential.status]}</strong>
          </div>
          <div>
            <span>{content.credential.updatedAt}</span>
            <strong>
              {connection.credential.updated_at
                ? content.dateTime(new Date(connection.credential.updated_at))
                : content.never}
            </strong>
          </div>
        </div>
        {draft.authMode !== connection.auth_mode ? (
          <div className="model-settings-notice model-settings-notice--warning">
            {content.credential.saveAuthFirst}
          </div>
        ) : connection.auth_mode === "api_key" ? (
          <div className="model-credential-editor">
            <label className="model-settings-field">
              <span>
                {connection.credential.configured
                  ? content.credential.replace
                  : content.fields.apiKey}
              </span>
              <Input
                type="password"
                autoComplete="new-password"
                value={apiKey}
                placeholder={content.fields.apiKeyPlaceholder}
                onChange={(event) => onApiKeyChange(event.target.value)}
              />
              <small>{content.fields.credentialHelp}</small>
            </label>
            <div className="model-credential-editor__actions">
              <Button
                type="button"
                size="sm"
                disabled={apiKey.trim() === "" || busyAction !== null}
                onClick={onSaveCredential}
              >
                {busyAction === "credential" ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : null}
                {content.credential.save}
              </Button>
              {connection.credential.configured ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={onClearCredential}
                >
                  {content.credential.clear}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="model-settings-notice">{content.credential.noneRequired}</div>
        )}
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
              value={draft.maxTokensField}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  maxTokensField: event.target.value as MaxTokensField
                })
              }
            >
              <option value="max_tokens">max_tokens</option>
              <option value="max_completion_tokens">max_completion_tokens</option>
            </select>
          </label>
          <label className="model-settings-check-field">
            <Checkbox
              checked={draft.includeUsage}
              onCheckedChange={(checked) =>
                onDraftChange({ ...draft, includeUsage: checked === true })
              }
            />
            <span>
              <strong>{content.fields.includeUsage}</strong>
              <small>{content.fields.includeUsageHelp}</small>
            </span>
          </label>
        </div>
        <div className="model-settings-card__footer">
          {saveButton(content.saveRequest)}
        </div>
      </section>
    </form>
  );
}
