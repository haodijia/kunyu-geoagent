import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  LoaderCircle,
  LogIn,
  LogOut,
  TriangleAlert,
} from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ogeAccountApi,
  ogeAccountQueryKey,
  type OgeAccountStatus,
} from "@/features/settings/oge/api";
import {
  SettingsPageHeader,
  SettingsPageWrapper,
} from "@/features/settings/SettingsPage";
import { zhCN } from "@/locales/zh-CN";

const content = zhCN.oge;

export function OgeSettingsPage() {
  const account = useQuery({
    queryKey: ogeAccountQueryKey,
    queryFn: ogeAccountApi.status,
    refetchInterval: 60_000
  });

  return (
    <SettingsPageWrapper>
      <SettingsPageHeader title={content.title} description={content.description} actions={null} />
      {account.isPending ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{content.loading}
        </div>
      ) : account.isError ? (
        <div className="mt-8 space-y-3" role="alert">
          <p className="text-sm text-destructive">{errorMessage(account.error)}</p>
          <Button variant="outline" size="sm" onClick={() => void account.refetch()}>{content.retry}</Button>
        </div>
      ) : (
        <OgeAccountForm key={account.data.updated_at} account={account.data} />
      )}
    </SettingsPageWrapper>
  );
}

function OgeAccountForm({ account }: { readonly account: OgeAccountStatus }) {
  const queryClient = useQueryClient();
  const [baseUrl, setBaseUrl] = useState(account.base_url);
  const [username, setUsername] = useState(account.username === null ? "" : account.username);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const mutation = useMutation({
    mutationFn: (action: "login" | "logout") => action === "login"
      ? ogeAccountApi.login({ base_url: baseUrl.trim(), username: username.trim(), password })
      : ogeAccountApi.logout(),
    onSuccess: (updated) => {
      setPassword("");
      queryClient.setQueryData(ogeAccountQueryKey, updated);
    },
    onError: (requestError) => {
      console.error("[oge] Account operation failed.", {
        code: requestError instanceof ApiError ? requestError.code : "CLIENT_ERROR"
      });
      setError(errorMessage(requestError));
    },
    onSettled: () => { submitting.current = false; }
  });
  const busy = mutation.isPending;
  const invalid = baseUrl.trim() === "" || username.trim() === "" || password.length === 0;
  const StatusIcon = account.state === "signed_in" ? CheckCircle2 : account.state === "expired" ? TriangleAlert : Circle;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || invalid) return;
    submitting.current = true;
    setError(null);
    mutation.mutate("login");
  }

  function logout() {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    mutation.mutate("logout");
  }

  return (
    <div className="mt-8 space-y-8">
      <section className="settings-list" aria-label={content.account}>
        <div className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div className="flex items-start gap-3">
            <StatusIcon className={`mt-0.5 size-4 ${account.state === "signed_in" ? "text-success" : account.state === "expired" ? "text-warning" : "text-muted-foreground"}`} aria-hidden="true" />
            <div className="space-y-1">
              <h2 className="settings-group__title">{content.states[account.state]}</h2>
              {account.username !== null ? <p className="m-0 text-sm text-secondary-foreground">{account.username}</p> : null}
              {account.expires_at !== null ? (
                <p className="m-0 text-xs text-muted-foreground">
                  {content.expiresAt(new Date(account.expires_at * 1000).toLocaleString("zh-CN"))}
                </p>
              ) : null}
              {account.state === "expired" ? <p className="m-0 text-xs text-warning">{content.expiredHelp}</p> : null}
            </div>
          </div>
          {account.state !== "signed_out" ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={logout}>
              {busy && mutation.variables === "logout" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <LogOut className="size-3.5" aria-hidden="true" />}
              {content.logout}
            </Button>
          ) : null}
        </div>
      </section>
      <form className="max-w-xl space-y-5" onSubmit={submit} aria-label={content.loginForm}>
        <div className="settings-group">
          <h2 className="settings-group__title">{account.state === "signed_out" ? content.login : content.loginAgain}</h2>
          <p className="settings-group__help">{content.credentialsHelp}</p>
        </div>
        <label className="flex flex-col gap-2 text-sm">
          <span>{content.endpoint}</span>
          <Input type="url" required value={baseUrl} maxLength={2048} disabled={busy} onChange={event => setBaseUrl(event.target.value)} />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span>{content.username}</span>
          <Input autoComplete="username" required value={username} maxLength={200} disabled={busy} onChange={event => setUsername(event.target.value)} />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span>{content.password}</span>
          <Input type="password" autoComplete="current-password" required value={password} maxLength={1024} disabled={busy} onChange={event => setPassword(event.target.value)} />
        </label>
        {error !== null ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <Button type="submit" disabled={busy || invalid}>
          {busy && mutation.variables === "login" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LogIn className="size-4" aria-hidden="true" />}
          {busy && mutation.variables === "login" ? content.loggingIn : content.login}
        </Button>
        <p className="m-0 text-xs leading-5 text-muted-foreground">{content.discoveryHelp}</p>
      </form>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return content.errors.requestFailed;
  switch (error.code) {
    case "INVALID_INPUT": return content.errors.invalidInput;
    case "OGE_AUTH_REJECTED": return content.errors.authRejected;
    case "OGE_TIMEOUT": return content.errors.timeout;
    case "OGE_NETWORK": return content.errors.network;
    case "OGE_STORAGE_FAILED": return content.errors.storage;
    case "OGE_PROTOCOL_ERROR": return content.errors.protocol;
    case "OGE_REMOTE_ERROR": return content.errors.remote;
    default: return content.errors.requestFailed;
  }
}
