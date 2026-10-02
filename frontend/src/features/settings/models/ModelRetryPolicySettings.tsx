import { useState } from "react";

import { Input } from "@/components/ui/input";
import { zhCN } from "@/locales/zh-CN";
import type { ModelConnection, RetryPolicy } from "./api";
import { ModelDetailSection, ModelExpandableRow } from "./ModelConnectionDetailControls";

const content = zhCN.modelConnections.retryPolicy;
const defaultCodes = ["MODEL_EMPTY_RESPONSE", "PROVIDER_RATE_LIMIT", "PROVIDER_SERVER", "PROVIDER_TIMEOUT", "PROVIDER_NETWORK"];

export function ModelRetryPolicySettings({ connection, disabled, onSave }: {
  readonly connection: ModelConnection;
  readonly disabled: boolean;
  readonly onSave: (policy: RetryPolicy) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<RetryPolicy["mode"]>("normal");
  const [limit, setLimit] = useState("5");
  const [codes, setCodes] = useState(defaultCodes.join(", "));
  const [initial, setInitial] = useState("");
  const [maximum, setMaximum] = useState("");
  const [jitter, setJitter] = useState("");
  const errors = codes.split(",").map((code) => code.trim());
  const backoff = { initial_delay_ms: Number(initial), max_delay_ms: Number(maximum), jitter_ratio: Number(jitter) };
  const valid = [initial, maximum, jitter].every((value) => value.trim().length > 0) && Object.values(backoff).every(Number.isFinite) &&
    backoff.initial_delay_ms > 0 && backoff.max_delay_ms >= backoff.initial_delay_ms && backoff.max_delay_ms <= 2_147_483_647 && backoff.jitter_ratio >= 0 && backoff.jitter_ratio <= 1 &&
    (mode === "always" || limit.trim().length > 0 && Number.isSafeInteger(Number(limit)) && Number(limit) >= 0 && errors.every((code) => code.length > 0 && code.length <= 128) && new Set(errors).size === errors.length);
  const busy = disabled;
  const policy = connection.retry_policy;
  return (
    <ModelDetailSection title={content.title} description={content.help}>
      <ModelExpandableRow label={content.label} value={policy.mode === "normal" ? content.normalSummary(policy.max_retries) : content.always} actionLabel={zhCN.modelConnections.detail.edit} editing={editing} busy={busy} canSave={valid}
        onEdit={() => {
          setMode(policy.mode); setInitial(String(policy.initial_delay_ms)); setMaximum(String(policy.max_delay_ms)); setJitter(String(policy.jitter_ratio));
          setLimit(policy.mode === "normal" ? String(policy.max_retries) : "5"); setCodes((policy.mode === "normal" ? policy.retryable_codes : defaultCodes).join(", "));
          setEditing(true);
        }} onCancel={() => setEditing(false)} onSave={() => {
          const next: RetryPolicy = mode === "normal" ? { ...backoff, mode, max_retries: Number(limit), retryable_codes: errors } : { ...backoff, mode };
          void onSave(next).then((saved) => { if (saved) setEditing(false); });
        }}>
        <label className="provider-form-field"><span>{content.mode}</span><select aria-label={content.mode} disabled={busy} value={mode} onChange={(event) => setMode(event.target.value as RetryPolicy["mode"])}><option value="normal">{content.normal}</option><option value="always">{content.always}</option></select></label>
        {mode === "normal" && <>
          <label className="provider-form-field"><span>{content.limit}</span><Input aria-label={content.limit} type="number" min={0} step={1} disabled={busy} value={limit} onChange={(event) => setLimit(event.target.value)} /></label>
          <label className="provider-form-field"><span>{content.codes}</span><Input aria-label={content.codes} disabled={busy} value={codes} onChange={(event) => setCodes(event.target.value)} /></label>
        </>}
        <label className="provider-form-field"><span>{content.initial}</span><Input aria-label={content.initial} type="number" min={0} max={2_147_483_647} disabled={busy} value={initial} onChange={(event) => setInitial(event.target.value)} /></label>
        <label className="provider-form-field"><span>{content.maximum}</span><Input aria-label={content.maximum} type="number" min={0} max={2_147_483_647} disabled={busy} value={maximum} onChange={(event) => setMaximum(event.target.value)} /></label>
        <label className="provider-form-field"><span>{content.jitter}</span><Input aria-label={content.jitter} type="number" min={0} max={1} step={0.01} disabled={busy} value={jitter} onChange={(event) => setJitter(event.target.value)} /></label>
        {!valid && <p role="alert" className="text-xs text-destructive">{content.invalid}</p>}
      </ModelExpandableRow>
    </ModelDetailSection>
  );
}
