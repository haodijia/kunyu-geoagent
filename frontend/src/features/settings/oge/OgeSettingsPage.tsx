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
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  CheckCircle2,
  Circle,
  LoaderCircle,
  LogIn,
  LogOut,
  TriangleAlert,
} from "lucide-vue-next";
import { computed, defineComponent, reactive, shallowRef } from "vue";
const content = zhCN.oge;
export const OgeSettingsPage = defineComponent(
  (_props, { slots: _slots }) => {
    const account = reactive(
      useQuery(
        computed(() => ({
          queryKey: ogeAccountQueryKey,
          queryFn: ogeAccountApi.status,
          refetchInterval: 60_000,
        })),
      ),
    );
    return () => {
      return (
        <SettingsPageWrapper>
          <SettingsPageHeader
            title={content.title}
            description={content.description}
            actions={null}
          />
          {account.isPending ? (
            <div
              class="mt-8 flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
              {content.loading}
            </div>
          ) : account.isError ? (
            <div class="mt-8 space-y-3" role="alert">
              <p class="text-sm text-destructive">
                {errorMessage(account.error)}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void account.refetch()}
              >
                {content.retry}
              </Button>
            </div>
          ) : (
            <OgeAccountForm
              key={account.data.updated_at ?? "logged-out"}
              account={account.data}
            />
          )}
        </SettingsPageWrapper>
      );
    };
  },
  {
    name: "OgeSettingsPage",
    inheritAttrs: false,
    props: [],
  },
);
const OgeAccountForm = defineComponent(
  (
    componentProps: {
      readonly account: OgeAccountStatus;
    },
    { slots: _slots },
  ) => {
    const account = computed(() => componentProps.account);
    const queryClient = useQueryClient();
    const baseUrl = shallowRef(account.value.base_url),
      setBaseUrl = refSetter(baseUrl);
    const username = shallowRef(
        account.value.username === null ? "" : account.value.username,
      ),
      setUsername = refSetter(username);
    const password = shallowRef(""),
      setPassword = refSetter(password);
    const error = shallowRef<string | null>(null),
      setError = refSetter(error);
    const submitting = shallowRef(false);
    const mutation = reactive(
      useMutation({
        mutationFn: (action: "login" | "logout") =>
          action === "login"
            ? ogeAccountApi.login({
                base_url: baseUrl.value.trim(),
                username: username.value.trim(),
                password: password.value,
              })
            : ogeAccountApi.logout(),
        onSuccess: (updated) => {
          setPassword("");
          queryClient.setQueryData(ogeAccountQueryKey, updated);
        },
        onError: (requestError) => {
          console.error("[oge] Account operation failed.", {
            code:
              requestError instanceof ApiError
                ? requestError.code
                : "CLIENT_ERROR",
          });
          setError(errorMessage(requestError));
        },
        onSettled: () => {
          submitting.value = false;
        },
      }),
    );
    const busy = computed(() => mutation.isPending);
    const invalid = computed(
      () =>
        baseUrl.value.trim() === "" ||
        username.value.trim() === "" ||
        password.value.length === 0,
    );
    const StatusIcon = computed(() =>
      account.value.state === "signed_in"
        ? CheckCircle2
        : account.value.state === "expired"
          ? TriangleAlert
          : Circle,
    );
    function submit(event: SubmitEvent) {
      event.preventDefault();
      if (submitting.value || invalid.value) return;
      submitting.value = true;
      setError(null);
      mutation.mutate("login");
    }
    function logout() {
      if (submitting.value) return;
      submitting.value = true;
      setError(null);
      mutation.mutate("logout");
    }
    return () => {
      const _account = account.value,
        _busy = busy.value,
        _invalid = invalid.value;
      return (
        <div class="mt-8 space-y-8">
          <section class="settings-list" aria-label={content.account}>
            <div class="flex flex-wrap items-center justify-between gap-4 py-5">
              <div class="flex items-start gap-3">
                <StatusIcon.value
                  class={`mt-0.5 size-4 ${_account.state === "signed_in" ? "text-success" : _account.state === "expired" ? "text-warning" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
                <div class="space-y-1">
                  <h2 class="settings-group__title">
                    {content.states[_account.state]}
                  </h2>
                  {_account.username !== null ? (
                    <p class="m-0 text-sm text-secondary-foreground">
                      {_account.username}
                    </p>
                  ) : null}
                  {_account.expires_at !== null ? (
                    <p class="m-0 text-xs text-muted-foreground">
                      {content.expiresAt(
                        new Date(_account.expires_at * 1000).toLocaleString(
                          "zh-CN",
                        ),
                      )}
                    </p>
                  ) : null}
                  {_account.state === "expired" ? (
                    <p class="m-0 text-xs text-warning">
                      {content.expiredHelp}
                    </p>
                  ) : null}
                </div>
              </div>
              {_account.state !== "signed_out" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={_busy}
                  onClick={logout}
                >
                  {_busy && mutation.variables === "logout" ? (
                    <LoaderCircle
                      class="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <LogOut class="size-3.5" aria-hidden="true" />
                  )}
                  {content.logout}
                </Button>
              ) : null}
            </div>
          </section>
          <form
            class="max-w-xl space-y-5"
            onSubmit={submit}
            aria-label={content.loginForm}
          >
            <div class="settings-group">
              <h2 class="settings-group__title">
                {_account.state === "signed_out"
                  ? content.login
                  : content.loginAgain}
              </h2>
              <p class="settings-group__help">{content.credentialsHelp}</p>
            </div>
            <label class="flex flex-col gap-2 text-sm">
              <span>{content.endpoint}</span>
              <Input
                type="url"
                required
                value={baseUrl.value}
                maxlength={2048}
                disabled={_busy}
                onInput={(event) =>
                  setBaseUrl((event.target as HTMLInputElement).value)
                }
              />
            </label>
            <label class="flex flex-col gap-2 text-sm">
              <span>{content.username}</span>
              <Input
                autocomplete="username"
                required
                value={username.value}
                maxlength={200}
                disabled={_busy}
                onInput={(event) =>
                  setUsername((event.target as HTMLInputElement).value)
                }
              />
            </label>
            <label class="flex flex-col gap-2 text-sm">
              <span>{content.password}</span>
              <Input
                type="password"
                autocomplete="current-password"
                required
                value={password.value}
                maxlength={1024}
                disabled={_busy}
                onInput={(event) =>
                  setPassword((event.target as HTMLInputElement).value)
                }
              />
            </label>
            {error.value !== null ? (
              <p class="text-sm text-destructive" role="alert">
                {error.value}
              </p>
            ) : null}
            <Button type="submit" disabled={_busy || _invalid}>
              {_busy && mutation.variables === "login" ? (
                <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn class="size-4" aria-hidden="true" />
              )}
              {_busy && mutation.variables === "login"
                ? content.loggingIn
                : content.login}
            </Button>
            <p class="m-0 text-xs leading-5 text-muted-foreground">
              {content.discoveryHelp}
            </p>
          </form>
        </div>
      );
    };
  },
  {
    name: "OgeAccountForm",
    inheritAttrs: false,
    props: ["account"],
  },
);
function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return content.errors.requestFailed;
  switch (error.code) {
    case "INVALID_INPUT":
      return content.errors.invalidInput;
    case "OGE_AUTH_REJECTED":
      return content.errors.authRejected;
    case "OGE_TIMEOUT":
      return content.errors.timeout;
    case "OGE_NETWORK":
      return content.errors.network;
    case "OGE_STORAGE_FAILED":
      return content.errors.storage;
    case "OGE_PROTOCOL_ERROR":
      return content.errors.protocol;
    case "OGE_REMOTE_ERROR":
      return content.errors.remote;
    default:
      return content.errors.requestFailed;
  }
}
