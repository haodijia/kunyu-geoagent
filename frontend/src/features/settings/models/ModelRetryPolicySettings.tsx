import { Input } from "@/components/ui/input";
import type {
  ModelConnection,
  RetryPolicy,
} from "@/features/settings/models/api";
import {
  ModelDetailSection,
  ModelExpandableRow,
} from "@/features/settings/models/ModelConnectionDetailControls";
import { refSetter } from "@/lib/lifecycle";
import { zhCN } from "@/locales/zh-CN";
import { computed, defineComponent, shallowRef } from "vue";
const content = zhCN.modelConnections.retryPolicy;
const defaultCodes = [
  "MODEL_EMPTY_RESPONSE",
  "PROVIDER_RATE_LIMIT",
  "PROVIDER_SERVER",
  "PROVIDER_TIMEOUT",
  "PROVIDER_NETWORK",
];
export const ModelRetryPolicySettings = defineComponent(
  (
    componentProps: {
      readonly connection: ModelConnection;
      readonly disabled: boolean;
      readonly onSave: (policy: RetryPolicy) => Promise<boolean>;
    },
    { slots: _slots },
  ) => {
    const connection = computed(() => componentProps.connection),
      disabled = computed(() => componentProps.disabled),
      onSave = computed(() => componentProps.onSave);
    const editing = shallowRef(false),
      setEditing = refSetter(editing);
    const mode = shallowRef<RetryPolicy["mode"]>("normal"),
      setMode = refSetter(mode);
    const limit = shallowRef("5"),
      setLimit = refSetter(limit);
    const codes = shallowRef(defaultCodes.join(", ")),
      setCodes = refSetter(codes);
    const initial = shallowRef(""),
      setInitial = refSetter(initial);
    const maximum = shallowRef(""),
      setMaximum = refSetter(maximum);
    const jitter = shallowRef(""),
      setJitter = refSetter(jitter);
    const errors = computed(() =>
      codes.value.split(",").map((code) => code.trim()),
    );
    const backoff = computed(() => ({
      initial_delay_ms: Number(initial.value),
      max_delay_ms: Number(maximum.value),
      jitter_ratio: Number(jitter.value),
    }));
    const valid = computed(
      () =>
        [initial.value, maximum.value, jitter.value].every(
          (value) => value.trim().length > 0,
        ) &&
        Object.values(backoff.value).every(Number.isFinite) &&
        backoff.value.initial_delay_ms > 0 &&
        backoff.value.max_delay_ms >= backoff.value.initial_delay_ms &&
        backoff.value.max_delay_ms <= 2_147_483_647 &&
        backoff.value.jitter_ratio >= 0 &&
        backoff.value.jitter_ratio <= 1 &&
        (mode.value === "always" ||
          (limit.value.trim().length > 0 &&
            Number.isSafeInteger(Number(limit.value)) &&
            Number(limit.value) >= 0 &&
            errors.value.every(
              (code) => code.length > 0 && code.length <= 128,
            ) &&
            new Set(errors.value).size === errors.value.length)),
    );
    const busy = computed(() => disabled.value);
    const policy = computed(() => connection.value.retry_policy);
    return () => {
      const _policy = policy.value,
        _busy = busy.value,
        _valid = valid.value,
        _backoff = backoff.value,
        _errors = errors.value,
        _onSave = onSave.value;
      return (
        <ModelDetailSection title={content.title} description={content.help}>
          <ModelExpandableRow
            label={content.label}
            value={
              _policy.mode === "normal"
                ? content.normalSummary(_policy.max_retries)
                : content.always
            }
            actionLabel={zhCN.modelConnections.detail.edit}
            editing={editing.value}
            busy={_busy}
            canSave={_valid}
            onEdit={() => {
              setMode(_policy.mode);
              setInitial(String(_policy.initial_delay_ms));
              setMaximum(String(_policy.max_delay_ms));
              setJitter(String(_policy.jitter_ratio));
              setLimit(
                _policy.mode === "normal" ? String(_policy.max_retries) : "5",
              );
              setCodes(
                (_policy.mode === "normal"
                  ? _policy.retryable_codes
                  : defaultCodes
                ).join(", "),
              );
              setEditing(true);
            }}
            onCancel={() => setEditing(false)}
            onSave={() => {
              const next: RetryPolicy =
                mode.value === "normal"
                  ? {
                      ..._backoff,
                      mode: mode.value,
                      max_retries: Number(limit.value),
                      retryable_codes: _errors,
                    }
                  : {
                      ..._backoff,
                      mode: mode.value,
                    };
              void _onSave(next).then((saved) => {
                if (saved) setEditing(false);
              });
            }}
          >
            <label class="provider-form-field">
              <span>{content.mode}</span>
              <select
                aria-label={content.mode}
                disabled={_busy}
                value={mode.value}
                onChange={(event) =>
                  setMode(
                    (event.target as HTMLInputElement)
                      .value as RetryPolicy["mode"],
                  )
                }
              >
                <option value="normal">{content.normal}</option>
                <option value="always">{content.always}</option>
              </select>
            </label>
            {mode.value === "normal" && (
              <>
                <label class="provider-form-field">
                  <span>{content.limit}</span>
                  <Input
                    aria-label={content.limit}
                    type="number"
                    min={0}
                    step={1}
                    disabled={_busy}
                    value={limit.value}
                    onInput={(event) =>
                      setLimit((event.target as HTMLInputElement).value)
                    }
                  />
                </label>
                <label class="provider-form-field">
                  <span>{content.codes}</span>
                  <Input
                    aria-label={content.codes}
                    disabled={_busy}
                    value={codes.value}
                    onInput={(event) =>
                      setCodes((event.target as HTMLInputElement).value)
                    }
                  />
                </label>
              </>
            )}
            <label class="provider-form-field">
              <span>{content.initial}</span>
              <Input
                aria-label={content.initial}
                type="number"
                min={0}
                max={2_147_483_647}
                disabled={_busy}
                value={initial.value}
                onInput={(event) =>
                  setInitial((event.target as HTMLInputElement).value)
                }
              />
            </label>
            <label class="provider-form-field">
              <span>{content.maximum}</span>
              <Input
                aria-label={content.maximum}
                type="number"
                min={0}
                max={2_147_483_647}
                disabled={_busy}
                value={maximum.value}
                onInput={(event) =>
                  setMaximum((event.target as HTMLInputElement).value)
                }
              />
            </label>
            <label class="provider-form-field">
              <span>{content.jitter}</span>
              <Input
                aria-label={content.jitter}
                type="number"
                min={0}
                max={1}
                step={0.01}
                disabled={_busy}
                value={jitter.value}
                onInput={(event) =>
                  setJitter((event.target as HTMLInputElement).value)
                }
              />
            </label>
            {!_valid && (
              <p role="alert" class="text-xs text-destructive">
                {content.invalid}
              </p>
            )}
          </ModelExpandableRow>
        </ModelDetailSection>
      );
    };
  },
  {
    name: "ModelRetryPolicySettings",
    inheritAttrs: false,
    props: ["connection", "disabled", "onSave"],
  },
);
