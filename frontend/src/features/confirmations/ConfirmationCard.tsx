import { Button } from "@/components/ui/button";
import { toolLabel } from "@/features/agent/tools/tool-presentation";
import type { Confirmation } from "@/features/confirmations/api";
import { FloodInputReview } from "@/features/confirmations/FloodInputReview";
import { cn } from "@/lib/utils";
import { zhCN } from "@/locales/zh-CN";
import {
  AlertTriangle,
  Check,
  LoaderCircle,
  RotateCw,
  ShieldCheck,
  Square,
  X,
} from "lucide-vue-next";
import { computed, defineComponent, type VNodeChild } from "vue";
type ConfirmationAction = "approve" | "reject";
export const ConfirmationCard = defineComponent(
  (
    componentProps: {
      readonly class: string;
      readonly confirmation: Confirmation;
      readonly pendingAction: ConfirmationAction | undefined;
      readonly onApprove: () => void;
      readonly onReject: () => void;
      readonly error: string | null;
    },
    { slots: _slots },
  ) => {
    const className = computed(() => componentProps.class),
      confirmation = computed(() => componentProps.confirmation),
      pendingAction = computed(() => componentProps.pendingAction),
      onApprove = computed(() => componentProps.onApprove),
      onReject = computed(() => componentProps.onReject),
      error = computed(() => componentProps.error);
    const content = zhCN.conversation.confirmation;
    const label = computed(() => toolLabel(confirmation.value.name));
    return () => {
      const _className = className.value,
        _confirmation = confirmation.value,
        _label = label.value,
        _pendingAction = pendingAction.value,
        _onReject = onReject.value,
        _onApprove = onApprove.value,
        _error = error.value;
      const floodReview =
        _confirmation.name === "oge_execute_service" &&
        _confirmation.arguments.service_name === "flood_monitoring_bundle";
      const parameters = (
        <pre class="m-0 max-h-48 overflow-auto rounded-lg bg-muted px-3 py-2.5 font-mono text-xs leading-5 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
          {JSON.stringify(_confirmation.arguments, null, 2)}
        </pre>
      );
      return (
        <aside
          class={_className}
          aria-labelledby={`confirmation-${_confirmation.id}`}
        >
          <div class="flex items-start gap-3 border-b border-border px-4 py-3.5">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
              <ShieldCheck
                class="size-4.5"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </span>
            <div class="min-w-0">
              <h3
                id={`confirmation-${_confirmation.id}`}
                class="m-0 font-semibold text-foreground"
              >
                {floodReview ? content.imagery.title : content.title}
              </h3>
              <p class="mt-1 mb-0 leading-5 text-muted-foreground">
                {floodReview
                  ? String(_confirmation.arguments.title)
                  : _confirmation.summary}
              </p>
            </div>
          </div>
          {floodReview ? (
            <div class="px-4 py-3">
              <FloodInputReview
                parameters={_confirmation.arguments.parameters}
              />
              <details class="mt-3 text-xs text-muted-foreground">
                <summary class="mb-2 w-fit cursor-pointer">
                  {content.parameters}
                </summary>
                {parameters}
              </details>
            </div>
          ) : (
            <dl class="m-0 divide-y divide-border px-4">
              <ConfirmationRow label={content.operation}>
                <span>{_label}</span>
                {_label !== _confirmation.name && (
                  <code class="ml-2 text-xs text-muted-foreground">
                    {_confirmation.name}
                  </code>
                )}
              </ConfirmationRow>
              <ConfirmationRow label={content.scope}>
                <span>{content.currentWorkspace}</span>
                <code class="ml-2 text-xs text-muted-foreground">
                  {_confirmation.workspace_id}
                </code>
              </ConfirmationRow>
              <ConfirmationRow label={content.parameters} vertical>
                {parameters}
              </ConfirmationRow>
              <ConfirmationRow label={content.sideEffect}>
                <span class="text-foreground">{_confirmation.side_effect}</span>
              </ConfirmationRow>
            </dl>
          )}
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p class="m-0 min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
              {floodReview ? content.imagery.submit : content.exactSnapshot}
            </p>
            <div class="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={_pendingAction !== undefined}
                onClick={_onReject}
              >
                {_pendingAction === "reject" ? (
                  <LoaderCircle
                    class="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <X class="size-3.5" aria-hidden="true" />
                )}
                {_pendingAction === "reject"
                  ? content.rejecting
                  : floodReview
                    ? content.imagery.reject
                    : content.reject}
              </Button>
              <Button
                size="sm"
                disabled={_pendingAction !== undefined}
                onClick={_onApprove}
              >
                {_pendingAction === "approve" ? (
                  <LoaderCircle
                    class="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Check class="size-3.5" aria-hidden="true" />
                )}
                {_pendingAction === "approve"
                  ? content.approving
                  : floodReview
                    ? content.imagery.approve
                    : content.approve}
              </Button>
            </div>
            {_error !== null ? (
              <p class="m-0 w-full text-xs text-destructive" role="alert">
                {_error}
              </p>
            ) : null}
          </div>
        </aside>
      );
    };
  },
  {
    name: "ConfirmationCard",
    inheritAttrs: false,
    props: ["confirmation", "pendingAction", "onApprove", "onReject", "error"],
  },
);
export const ConfirmationUnavailable = defineComponent(
  (
    componentProps: {
      readonly class: string;
      readonly loading: boolean;
      readonly pending: boolean;
      readonly error: string | null;
      readonly onCancel: () => void;
      readonly onRetry: () => void;
    },
    { slots: _slots },
  ) => {
    const className = computed(() => componentProps.class),
      loading = computed(() => componentProps.loading),
      pending = computed(() => componentProps.pending),
      error = computed(() => componentProps.error),
      onCancel = computed(() => componentProps.onCancel),
      onRetry = computed(() => componentProps.onRetry);
    const content = zhCN.conversation.confirmation;
    return () => {
      const _className2 = className.value,
        _loading = loading.value,
        _pending = pending.value,
        _onRetry = onRetry.value,
        _onCancel = onCancel.value,
        _error2 = error.value;
      return (
        <aside
          class={cn(
            _className2,
            "flex flex-wrap items-start gap-3 px-4 py-3.5",
          )}
        >
          {_loading ? (
            <LoaderCircle
              class="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <AlertTriangle
              class="mt-0.5 size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
          )}
          <div class="min-w-52 flex-1">
            <p class="m-0 font-medium text-foreground">
              {_loading ? content.loading : content.loadFailed}
            </p>
            <p class="mt-1 mb-0 text-xs leading-5 text-muted-foreground">
              {content.loadFailedHelp}
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            {!_loading ? (
              <Button
                size="sm"
                variant="outline"
                disabled={_pending}
                onClick={_onRetry}
              >
                <RotateCw class="size-3.5" aria-hidden="true" />
                {content.retry}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={_pending}
              onClick={_onCancel}
            >
              {_pending ? (
                <LoaderCircle
                  class="size-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Square class="size-3" aria-hidden="true" />
              )}
              {_pending ? content.cancelling : content.cancelAgent}
            </Button>
          </div>
          {_error2 !== null ? (
            <p class="m-0 w-full text-xs text-destructive" role="alert">
              {_error2}
            </p>
          ) : null}
        </aside>
      );
    };
  },
  {
    name: "ConfirmationUnavailable",
    inheritAttrs: false,
    props: ["loading", "pending", "error", "onCancel", "onRetry"],
  },
);
const ConfirmationRow = defineComponent(
  (
    componentProps: {
      readonly children?: VNodeChild;
      readonly label: string;
      readonly vertical?: boolean;
    },
    { slots },
  ) => {
    const children = () => slots.default?.(),
      label = computed(() => componentProps.label),
      vertical = computed(() =>
        componentProps.vertical === undefined ? false : componentProps.vertical,
      );
    return () => {
      const _vertical = vertical.value,
        _label2 = label.value;
      return (
        <div
          class={cn(
            "grid gap-3 py-3",
            _vertical ? "grid-cols-1" : "grid-cols-[7rem_1fr]",
          )}
        >
          <dt class="text-xs font-medium text-muted-foreground">{_label2}</dt>
          <dd class="m-0 min-w-0 [overflow-wrap:anywhere]">{children()}</dd>
        </div>
      );
    };
  },
  {
    name: "ConfirmationRow",
    inheritAttrs: false,
    props: ["label", "vertical"],
  },
);
